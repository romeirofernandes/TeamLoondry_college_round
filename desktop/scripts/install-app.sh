#!/usr/bin/env bash
set -euo pipefail
repo="romeirofernandes/TeamLoondry_college_round"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'This preview requires an Apple Silicon Mac.' >&2; exit 1; }
mac_version=$(sw_vers -productVersion)
(( ${mac_version%%.*} >= 26 )) || { echo 'macOS 26 or newer is required.' >&2; exit 1; }
[[ "${HANDSFREE_ALLOW_UNSIGNED_MAC:-0}" == 1 ]] || { echo 'This preview has no Apple Developer ID signature. Set HANDSFREE_ALLOW_UNSIGNED_MAC=1 to opt in.' >&2; exit 1; }
install_dir="${HANDSFREE_INSTALL_DIR:-$HOME/Applications}"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/handsfree-install.XXXXXX")
mount_dir=""
staged=""
backup=""
destination="$install_dir/Handsfree.app"
cleanup(){
  if [[ -n "$mount_dir" ]]; then hdiutil detach "$mount_dir" >/dev/null 2>&1 || true; fi
  if [[ -n "$staged" && -d "$staged" ]]; then rm -rf "$staged"; fi
  rm -rf "$work_dir"
}
trap cleanup EXIT
if [[ $# == 2 && "$1" == --local-package ]]; then
  package="$2"
  [[ -f "$package" && -f "$(dirname "$package")/SHA256SUMS" ]] || { echo 'Package and SHA256SUMS are required.' >&2; exit 1; }
  cp "$package" "$work_dir/$(basename "$package")"
  cp "$(dirname "$package")/SHA256SUMS" "$work_dir/SHA256SUMS"
  asset=$(basename "$package")
else
  [[ $# == 0 ]] || { echo 'Usage: install-app.sh [--local-package FILE]' >&2; exit 1; }
  tag="${HANDSFREE_VERSION:-}"
  if [[ -z "$tag" ]]; then
    resolved=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")
    tag=${resolved##*/}
  fi
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || { echo 'No valid release found.' >&2; exit 1; }
  release_version=${tag#v}
  release_version=${release_version%%-*}
  asset="Handsfree_${release_version}_aarch64.dmg"
  url="https://github.com/$repo/releases/download/$tag"
  curl -fsSL --retry 3 "$url/$asset" -o "$work_dir/$asset"
  curl -fsSL --retry 3 "$url/SHA256SUMS" -o "$work_dir/SHA256SUMS"
fi
expected=$(awk -v name="$asset" '$2==name {print $1}' "$work_dir/SHA256SUMS")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo 'Exactly one package checksum is required.' >&2; exit 1; }
actual=$(shasum -a 256 "$work_dir/$asset" | awk '{print $1}')
[[ "$expected" == "$actual" ]] || { echo 'Package checksum mismatch. Existing installation preserved.' >&2; exit 1; }
mkdir -p "$install_dir"
[[ ! -L "$destination" ]] || { echo 'Refusing to replace a symlink installation.' >&2; exit 1; }
mount_dir="$work_dir/mount"
mkdir "$mount_dir"
hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$work_dir/$asset" >/dev/null
[[ -d "$mount_dir/Handsfree.app" ]] || { echo 'Handsfree.app is absent from the package.' >&2; exit 1; }
staged=$(mktemp -d "$install_dir/.Handsfree.stage.XXXXXX")
ditto "$mount_dir/Handsfree.app" "$staged/Handsfree.app"
hdiutil detach "$mount_dir" >/dev/null
mount_dir=""
app="$staged/Handsfree.app"
identifier=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")
[[ "$identifier" == com.handsfree.desktop ]] || { echo 'Unexpected app identity.' >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
[[ -n "$executable" && "$executable" != */* && -x "$app/Contents/MacOS/$executable" ]] || { echo 'Invalid app executable.' >&2; exit 1; }
if ! codesign --verify --deep --strict "$app"; then
  signature=$(codesign --display --verbose=2 "$app" 2>&1 || true)
  [[ "$signature" != *"Authority="* ]] || { echo 'An identified developer signature is invalid.' >&2; exit 1; }
  codesign --force --deep --sign - "$app"
  codesign --verify --deep --strict "$app"
fi
if [[ -e "$destination" ]]; then
  backup=$(mktemp -d "$install_dir/.Handsfree.backup.XXXXXX")
  mv "$destination" "$backup/Handsfree.app"
fi
if ! mv "$app" "$destination"; then
  if [[ -n "$backup" ]]; then mv "$backup/Handsfree.app" "$destination"; fi
  echo 'Replacement failed; previous app restored.' >&2
  exit 1
fi
if [[ -n "$backup" ]]; then rm -rf "$backup"; fi
printf 'Installed Handsfree at %s\n' "$destination"
echo 'First open: if macOS blocks launch, use System Settings > Privacy & Security > Open Anyway for Handsfree.'
echo 'Camera and macOS input-control access are separate grants. Existing files are preserved.'
if [[ "${HANDSFREE_NO_LAUNCH:-0}" != 1 ]]; then open "$destination"; fi
