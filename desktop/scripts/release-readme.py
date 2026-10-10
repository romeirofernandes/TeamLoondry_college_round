"""Maintain a bounded README block and release metadata after verified publication."""
import json,os,pathlib,sys
repo=os.environ.get('GITHUB_REPOSITORY','romeirofernandes/TeamLoondry_college_round')
tag=sys.argv[1];asset_id=int(sys.argv[2]);root=pathlib.Path(__file__).resolve().parents[2]
block=f'''<!-- handsfree-release:start -->
## Install or update the Mac app

Latest tested preview: [{tag}](https://github.com/{repo}/releases/tag/{tag}). Apple Silicon, macOS 26+. This preview is unsigned and not notarized.

The repository is private. Collaborators still need an authenticated download; these commands reuse your existing GitHub CLI login without asking you to sign in again. Quit Handsfree before updating.

```bash
curl -fL --retry 3 -H "Authorization: Bearer $(gh auth token)" -H "Accept: application/octet-stream" \\
  https://api.github.com/repos/{repo}/releases/assets/{asset_id} -o /tmp/install-handsfree.sh
HANDSFREE_ALLOW_UNSIGNED_MAC=1 HANDSFREE_VERSION={tag} bash /tmp/install-handsfree.sh
open "$HOME/Applications/Handsfree.app"
```

To update using the separately published update entry point:

```bash
gh release download {tag} --repo {repo} --pattern update-app.sh --dir /tmp/handsfree-update --clobber
HANDSFREE_ALLOW_UNSIGNED_MAC=1 HANDSFREE_VERSION={tag} bash /tmp/handsfree-update/update-app.sh
```

The installer verifies the DMG checksum, stages replacement, preserves app data, and refreshes an existing browser registration. `GH_TOKEN` can supply an existing credential for automation. For a manual download, get the DMG, `SHA256SUMS`, and `install-app.sh` from the release page, keep them together, then run:

```bash
HANDSFREE_ALLOW_UNSIGNED_MAC=1 bash install-app.sh --local-package Handsfree_0.2.0_aarch64.dmg
```

Setup, compact panel, browser pairing and verification limits: [desktop guide](desktop/README.md). Full plan: [desktop/app-docs.md](desktop/app-docs.md). Local Writing remains on-device; native Writing is still pending.
<!-- handsfree-release:end -->'''
f=root/'README.md';text=f.read_text();start='<!-- handsfree-release:start -->';end='<!-- handsfree-release:end -->'
if start in text:a=text.index(start);b=text.index(end,a)+len(end);text=text[:a]+block+text[b:]
else:text+='\n\n'+block+'\n'
f.write_text(text)
(root/'desktop/release-info.json').write_text(json.dumps({'tag':tag,'repository':repo,'version':'0.2.0','installerAssetId':asset_id,'platform':'macos-arm64','minimumMacOS':'26','unsigned':True},indent=2)+'\n')
