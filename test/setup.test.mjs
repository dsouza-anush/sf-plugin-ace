import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, chmod, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupPlan, setupMetadata, keyPair, verifySetupMetadata } from '../lib/setup.js';
import Setup from '../lib/commands/ace/setup.js';

const options = {
  orgId: '00D000000000001AAA',
  admin: 'admin@example.com',
  instanceUrl: 'https://example.my.salesforce.com',
  username: 'user@example.com',
  appName: 'ACE_CLI',
  contactEmail: 'user@example.com',
  alias: 'ace',
  keyDirectory: '/tmp/ace-test-keys',
  agentId: 'Existing_Agent',
};

test('setup preview and approval failures never reach the org or write keys', async () => {
  const org = {
    getOrgId: () => options.orgId,
    getUsername: () => options.admin,
    getConnection: () => ({
      instanceUrl: options.instanceUrl,
      refreshAuth: () => {
        throw new Error('Network must not be called');
      },
    }),
  };
  const command = new Setup([], {});
  command.jsonEnabled = () => true;
  const base = {
    'target-org': org,
    username: options.username,
    'app-name': options.appName,
    alias: options.alias,
    'agent-id': options.agentId,
    'key-dir': options.keyDirectory,
  };
  command.parse = async () => ({ flags: { ...base, 'dry-run': true } });
  const preview = await command.run();
  assert.equal(preview.state, 'planned');
  assert.equal(preview.plan.fingerprint, setupPlan(options).fingerprint);
  command.parse = async () => ({ flags: { ...base, 'no-prompt': true } });
  await assert.rejects(command.run(), { name: 'SetupWriteNotEnabled' });
  command.parse = async () => ({ flags: { ...base, 'allow-write': true, 'no-prompt': true, confirm: 'wrong' } });
  await assert.rejects(command.run(), { name: 'SetupConfirmationRequired' });
});

test('setup approval binds identity, app, key location and verification agent', () => {
  const fingerprint = setupPlan(options).fingerprint;
  for (const key of ['orgId', 'username', 'appName', 'keyDirectory', 'agentId', 'alias'])
    assert.notEqual(setupPlan({ ...options, [key]: `${options[key]}X` }).fingerprint, fingerprint);
  assert.throws(() => setupPlan({ ...options, appName: '../ACE' }), { name: 'InvalidSetupName' });
  assert.throws(() => setupPlan({ ...options, username: 'user\nsecret' }), { name: 'InvalidSetupInput' });
});

test('key generation is private, reusable and refuses partial, mismatched or symlink keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ace-keys-test-'));
  const other = await mkdtemp(join(tmpdir(), 'ace-keys-other-'));
  try {
    const first = await keyPair(directory, true);
    const original = await readFile(first.keyFile);
    assert.equal((await stat(first.keyFile)).mode & 0o077, 0);
    assert.deepEqual(await keyPair(directory, false), first);
    assert.deepEqual(await readFile(first.keyFile), original);
    const second = await keyPair(other, true);
    await writeFile(join(directory, 'server.crt'), second.certificate);
    await assert.rejects(keyPair(directory, false), { name: 'SetupKeyMismatch' });
    await rm(join(directory, 'server.crt'));
    await assert.rejects(keyPair(directory, true), { name: 'SetupKeyIncomplete' });
    await symlink(join(other, 'server.crt'), join(directory, 'server.crt'));
    await assert.rejects(keyPair(directory, false), { name: 'UnsafeSetupKey' });
    await chmod(other, 0o755);
    await assert.rejects(keyPair(other, false), { name: 'UnsafeSetupDirectory' });
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

test('reuse rejects mismatched certificates, broader scopes, policies and disabled apps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ace-metadata-test-'));
  try {
    const { certificate } = await keyPair(dir, true);
    const plan = setupPlan(options);
    const records = {
      global: {
        externalClientApplication: options.appName,
        certificate,
        consumerKey: 'test_consumer',
        isClientCredentialsFlowEnabled: false,
        isCodeCredFlowEnabled: false,
        isDeviceFlowEnabled: false,
        isTokenExchangeEnabled: false,
        isNamedUserJwtEnabled: false,
      },
      oauth: {
        externalClientApplication: options.appName,
        commaSeparatedOauthScopes: 'Api, RefreshToken, CDPIngest, CDPQuery',
      },
      policy: {
        externalClientApplication: options.appName,
        permittedUsersPolicyType: 'AdminApprovedPreAuthorized',
        commaSeparatedPermissionSet: 'ACE_CLI_User',
        ipRelaxationPolicyType: 'Enforce',
      },
      appPolicy: { externalClientApplication: options.appName, isEnabled: true, isOauthPluginEnabled: true },
    };
    assert.equal(verifySetupMetadata(plan, certificate, records), 'test_consumer');
    for (const [section, field, value] of [
      ['global', 'certificate', 'bad'],
      ['oauth', 'commaSeparatedOauthScopes', 'Api, Full'],
      ['policy', 'commaSeparatedProfile', 'Admin'],
      ['policy', 'commaSeparatedPermissionSet', 'Other'],
      ['global', 'isNamedUserJwtEnabled', true],
      ['appPolicy', 'isEnabled', false],
    ]) {
      assert.throws(
        () =>
          verifySetupMetadata(plan, certificate, { ...records, [section]: { ...records[section], [field]: value } }),
        { name: 'SetupConfigurationMismatch' },
      );
    }
    const files = setupMetadata(plan, certificate);
    assert.equal(Object.keys(files).length, 6);
    assert(!Object.values(files).join('').includes('PRIVATE KEY'));
    assert.match(
      files['extlClntAppOauthPolicies/ACE_CLI_defaultPolicy.ecaOauthPlcy-meta.xml'],
      /AdminApprovedPreAuthorized/,
    );
    assert(!files['permissionsets/ACE_CLI_User.permissionset-meta.xml'].includes('userPermissions'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
