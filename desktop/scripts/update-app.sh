#!/usr/bin/env bash
set -euo pipefail
# Both entry points are published with identical installer behavior.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -f "$script_dir/install-app.sh" ]]; then
  exec bash "$script_dir/install-app.sh" "$@"
fi
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/handsfree-update.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
repo="romeirofernandes/TeamLoondry_college_round"
if [[ -n "${HANDSFREE_VERSION:-}" ]]; then
  [[ "$HANDSFREE_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || exit 1
  url="https://github.com/$repo/releases/download/$HANDSFREE_VERSION"
else
  resolved=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")
  tag=${resolved##*/}
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || exit 1
  export HANDSFREE_VERSION="$tag"
  url="https://github.com/$repo/releases/download/$tag"
fi
curl -fsSL "$url/install-app.sh" -o "$work_dir/install-app.sh"
curl -fsSL "$url/SHA256SUMS" -o "$work_dir/SHA256SUMS"
(cd "$work_dir" && awk '$2=="install-app.sh"' SHA256SUMS | shasum -a 256 -c -)
bash "$work_dir/install-app.sh" "$@"
