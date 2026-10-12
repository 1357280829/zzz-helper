// Remove only known, reproducible build/test outputs; retain current installers and source inputs.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {version} = require('../package.json');
const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw Error('Usage: npm run clean [-- --dry-run]');
const keep = new Set([
  `ZZZ-Helper-${version}-win-x64.exe`,
  `ZZZ-Helper-${version}-mac-arm64.dmg`,
  `ZZZ-Helper-${version}-mac-x64.dmg`,
  `ZZZ-Helper-${version}-SHA256SUMS.txt`
]);
function generated(directory, entry) {
  const name = entry.name;
  if (entry.isSymbolicLink()) return false;
  if (directory === 'dist') {
    if (keep.has(name)) return false;
    return entry.isDirectory() ? ['win-unpacked', 'mac', 'mac-arm64', 'mac-universal'].includes(name) :
      /^(ZZZ-Helper|ZZZ-Buff-Studio)-.+\.(exe|dmg|zip)(\.blockmap)?$/.test(name) ||
      /^ZZZ-Helper-.+-SHA256SUMS\.txt$/.test(name) ||
      /^builder-(debug|effective-config)\.ya?ml$/.test(name) ||
      /^zzz-helper-.+\.nsis\.(7z|zip)$/.test(name);
  }
  return entry.isDirectory() ?
    /^(smoke-profile|smoke-v2|schemes-ui|advice-ui|team-results-ui|desktop-ui|package-ui|account-network|cookie-response)-\d+$/.test(name) ||
    ['font-preview-profile', 'header-check-profile', 'network-check-profile', 'ref-check-profile'].includes(name) :
    /^electron-v[\d.]+-(darwin|win32|linux)-(arm64|x64)\.zip$/.test(name) ||
    /^select-fixture-\d+\.html$/.test(name) ||
    /^(v\d+-.+|select-app-.+|account-qr-preview|catalog-preview|desktop-preview|font-preview-\d+|team-comparison-(preview|results))\.png$/.test(name) ||
    ['roxy-circle.webp', 'remielle-circle.webp', 'roxy-select.webp', 'roxy-art.webp', 'roxy-interknot.webp'].includes(name);
}
async function entries(directory) {
  try { return await fs.readdir(path.join(root, directory), {withFileTypes: true}); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
(async () => {
  let count = 0;
  for (const directory of ['dist', 'artifacts']) {
    const targets = (await entries(directory)).filter(entry => generated(directory, entry));
    for (const entry of targets) {
      const target = path.join(root, directory, entry.name);
      if (!dryRun) await fs.rm(target, {recursive: true, force: true});
    }
    count += targets.length;
    console.log(`${directory}: ${dryRun ? 'would remove' : 'removed'} ${targets.length} generated entries`);
  }
  if (!dryRun) {
    const manifest = path.join(root, 'dist', `ZZZ-Helper-${version}-SHA256SUMS.txt`);
    try {
      const content = await fs.readFile(manifest, 'utf8');
      const retained = [];
      for (const line of content.split('\n').filter(Boolean)) {
        const name = line.match(/^[a-f0-9]{64}  (.+)$/)?.[1];
        if (name && keep.has(name)) {
          try { await fs.access(path.join(root, 'dist', name)); retained.push(line); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      await fs.writeFile(manifest, retained.join('\n') + '\n');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  console.log(`${dryRun ? 'Preview' : 'Cleanup'} complete: ${count} entries. Current EXE/DMG installers, development dependencies and source inputs retained.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
