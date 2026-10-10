import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'ace-sf-consumer-'));
const env = {
  ...process.env,
  XDG_DATA_HOME: join(folder, 'data'),
  XDG_CONFIG_HOME: join(folder, 'config'),
  SF_STATE_FOLDER: join(folder, 'state'),
  SF_AUTOUPDATE_DISABLE: 'true',
  SF_DISABLE_TELEMETRY: 'true',
};
const sf = (args) =>
  execFileSync('sf', args, {
    env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input: 'y\n',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180000,
  });
try {
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', folder], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )[0];
  const artifact = resolve(folder, packed.filename);
  sf(['plugins', 'install', `file:${artifact}`]);
  const installed = JSON.parse(sf(['plugins', '--json'])).find(
    (plugin) => plugin.name === '@anushdsouza/sf-plugin-ace',
  );
  assert(
    installed && resolve(installed.root).startsWith(resolve(folder) + sep),
    'Plugin installation must be isolated from user plugins',
  );
  assert.equal(installed.type, 'user');
  const schema = JSON.parse(sf(['ace', 'schema', '--json']));
  assert.equal(schema.status, 0);
  assert.equal(schema.result.operations.length, 18);
  assert.match(sf(['ace', 'memory', 'delete', '--help']), /--confirm/);
  sf(['plugins', 'uninstall', '@anushdsouza/sf-plugin-ace']);
  assert(!JSON.parse(sf(['plugins', '--json'])).some((plugin) => plugin.name === '@anushdsouza/sf-plugin-ace'));
  console.log('Isolated Salesforce CLI tarball installation, schema, help, and uninstall passed.');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
