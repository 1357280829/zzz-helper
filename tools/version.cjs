// Assistant major/minor follow the bundled formal game snapshot; patch starts at 1.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, text) => fs.writeFileSync(path.join(root, name), text);
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const game = require('../src/data/game-data.js').version.match(/^(\d+)\.(\d+)(?:\.\d+)?(?:\+\d+)?$/);
if (!game) throw Error('Game snapshot has an unsupported version');
const prefix = game[1] + '.' + game[2];
const mode = process.argv[2] || 'check';
if (!['check', 'next'].includes(mode) || process.argv.length > 3) throw Error('Usage: node tools/version.cjs [check|next]');
if (mode === 'next') {
  const old = pkg.version, parts = old.split('.');
  const patch = parts.slice(0,2).join('.') === prefix ? Number(parts[2]) + 1 : 1;
  if (!Number.isSafeInteger(patch) || patch < 1) throw Error('Invalid assistant patch version');
  const version = prefix + '.' + patch;
  pkg.version = version; lock.version = version; lock.packages[''].version = version;
  const html = read('src/index.html');
  const updated = html.replace(/(<div class="edition">[^<]*<small>)[^<]+(<\/small>)/, '$1' + version + '$2');
  if (html === updated) throw Error('Assistant version label was not found');
  write('src/index.html', updated);
  write('package.json', JSON.stringify(pkg, null, 2) + '\n');
  write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
  write('README.md', read('README.md').replaceAll(old, version));
  console.log('Assistant version: ' + old + ' -> ' + version + ' (game ' + prefix + ')');
} else {
  const parts = pkg.version.split('.');
  const displayed = read('src/index.html').match(/<div class="edition">[^<]*<small>([^<]+)<\/small>/)?.[1];
  if (parts.length !== 3 || parts.slice(0,2).join('.') !== prefix || !/^[1-9]\d*$/.test(parts[2]) ||
      displayed !== pkg.version || lock.version !== pkg.version || lock.packages[''].version !== pkg.version)
    throw Error('Assistant version must follow game ' + prefix + '. Run npm run version:next and keep package, lockfile and sidebar synchronized.');
  console.log('PASS version ' + pkg.version + ' matches formal game ' + prefix + ', lockfile and sidebar');
}
