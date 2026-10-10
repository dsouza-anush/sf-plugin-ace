import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json'));
assert.equal(process.argv[2] ?? process.env.RELEASE_TAG, `v${pkg.version}`, 'Release tag/version mismatch');
assert(readFileSync('CHANGELOG.md', 'utf8').includes(`## ${pkg.version} —`));
console.log(`Release identity verified: v${pkg.version}`);
