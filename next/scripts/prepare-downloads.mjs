import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const website = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(website, '..');
const output = path.join(website, 'public/downloads');
const workspace = await mkdtemp(path.join(tmpdir(), 'handsfree-downloads-'));
try {
  // Build from an isolated copy so the installed development extension is untouched.
  const chrome = path.join(workspace, 'extension');
  await mkdir(chrome, { recursive: true });
  for (const name of ['src', 'scripts', 'manifest.json']) {
    await cp(path.join(repo, 'extension', name), path.join(chrome, name), { recursive: true });
  }
  // Cached models are optional; the build fetches and checks them when missing.
  await cp(path.join(repo, 'extension/assets'), path.join(chrome, 'assets'), { recursive: true })
    .catch(error => { if (error.code !== 'ENOENT') throw error; });
  await cp(path.join(repo, 'shared'), path.join(workspace, 'shared'), { recursive: true });
  for (const name of ['public/brand', 'app/fonts']) {
    await cp(path.join(website, name), path.join(workspace, 'next', name), { recursive: true });
  }
  await symlink(path.join(repo, 'extension/node_modules'), path.join(chrome, 'node_modules'), 'dir');
  execFileSync(process.execPath, [path.join(chrome, 'scripts/build.mjs')], {
    env: { ...process.env, HANDSFREE_RELEASE: '1' }, stdio: 'inherit',
  });
  const chromeManifest = JSON.parse(await readFile(path.join(chrome, 'manifest.json'), 'utf8'));
  const firefoxManifest = JSON.parse(await readFile(path.join(repo, 'firefix/manifest.json'), 'utf8'));
  const packages = {};
  await mkdir(output, { recursive: true });
  for (const [browser, manifest] of [['chrome', chromeManifest], ['firefox', firefoxManifest]]) {
    const filename = `handsfree-${browser}-${manifest.version}.zip`;
    const staged = path.join(workspace, filename);
    if (browser === 'chrome') {
      execFileSync('zip', ['-qr', staged, '.'], { cwd: path.join(chrome, 'dist') });
    } else {
      await cp(path.join(repo, 'firefix/releases', filename), staged);
    }
    execFileSync('unzip', ['-tq', staged]);
    const bytes = await readFile(staged);
    packages[browser] = { filename, version: manifest.version, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') };
    const destination = path.join(output, filename);
    await cp(staged, destination + ".tmp");
    await rename(destination + ".tmp", destination);
  }
  await writeFile(path.join(output, 'packages.json'), JSON.stringify(packages, null, 2) + '\n');
  console.log('Download ZIPs prepared. Chrome local configuration and dist were not changed.');
} finally {
  await rm(workspace, { recursive: true, force: true });
}
