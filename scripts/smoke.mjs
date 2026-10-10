import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { operations } from '../lib/contracts.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const runner = join(root, 'bin/run.js');
for (const command of [...operations.map((op) => op.command), 'ace schema']) {
  const output = execFileSync(process.execPath, [runner, ...command.split(' '), '--help'], {
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.match(output, /USAGE/);
  assert.match(output, /--json/);
}
const temp = mkdtempSync(join(tmpdir(), 'ace-cli-pack-'));
try {
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' }),
  );
  const files = packed[0].files.map((file) => file.path);
  assert(files.includes('bin/run.js'));
  assert.equal(files.filter((path) => /^lib\/commands\/.*\.js$/.test(path)).length, 19);
  assert(!files.some((path) => /node_modules|\.env|\.runtime|evidence|test\//.test(path)));
  execFileSync('tar', ['-xzf', join(temp, packed[0].filename), '-C', temp]);
  // An actual clean dependency install verifies the packed plugin is self-contained.
  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: join(temp, 'package'),
    stdio: 'pipe',
    timeout: 180000,
  });
  const output = JSON.parse(
    execFileSync(process.execPath, [join(temp, 'package/bin/run.js'), 'ace', 'schema', '--json'], {
      encoding: 'utf8',
      timeout: 20000,
    }),
  );
  assert.equal(output.result.operations.length, 18);
  const pkg = JSON.parse(readFileSync(join(temp, 'package/package.json')));
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.name, '@anushdsouza/sf-plugin-ace');
  assert(files.includes('LICENSE'));
  assert(files.includes('oclif.manifest.json'));
  assert(!files.some((path) => /CP-VERIFICATION|COFFEE-CONCIERGE|VERIFICATION\.json/.test(path)));
  assert.equal(pkg.publishConfig.access, 'public');
  console.log(
    JSON.stringify({ commands: 19, help: 'passed', package: 'clean-install-and-execution-passed', liveRequests: 0 }),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
