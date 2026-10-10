import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { publicFiles } from './public-files.mjs';

const root = resolve(process.argv[2] ?? '.');
const files = [];
async function visit(path) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  assert(!stat.isSymbolicLink(), `Symlink forbidden: ${relative(root, path)}`);
  if (stat.isDirectory()) {
    for (const item of await readdir(path)) await visit(resolve(path, item));
  } else files.push(path);
}
for (const file of publicFiles) await visit(resolve(root, file));
const forbidden = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,})\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /cp-d360-test|cp-d360-term|Capricorn_Coffee_Concierge|ace_cli_cp_test|git\.soma\.salesforce\.com/,
  /\/Users\/[^/\s]+\//,
];
for (const file of files) {
  if (file.endsWith('scripts/release-boundary.mjs')) continue;
  const content = await readFile(file, 'utf8');
  for (const pattern of forbidden)
    assert(!pattern.test(content), `Release boundary violation: ${relative(root, file)}`);
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json')));
assert.equal(pkg.name, '@anushdsouza/sf-plugin-ace');
assert.equal(pkg.publishConfig.access, 'public');
assert(!pkg.files.includes('docs'), 'Package docs must use an explicit file allowlist');
assert(!pkg.files.some((file) => /CP-|COFFEE-CONCIERGE/.test(file)));
console.log(`Public source boundary passed for ${files.length} allowlisted files.`);
