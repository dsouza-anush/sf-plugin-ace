import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Org, StateAggregator } from '@salesforce/core';
import Setup from '../lib/commands/ace/setup.js';
import { AceTransport } from '../lib/client.js';
import { setupPlan } from '../lib/setup.js';

// Exercise the command and child CLI orchestration without touching an org or user state.
test('setup fresh provisioning, reuse, alias restoration and uncertain deployment', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ace-setup-workflow-'));
  const previousPath = process.env.PATH;
  const callsFile = join(directory, 'calls.jsonl');
  const deployedFile = join(directory, 'deployed');
  const failureFile = join(directory, 'fail');
  const options = {
    orgId: '00D000000000001AAA',
    admin: 'admin@example.com',
    instanceUrl: 'https://example.my.salesforce.com',
    username: 'user@example.com',
    appName: 'ACE_CLI',
    contactEmail: 'user@example.com',
    alias: 'ace',
    keyDirectory: join(directory, 'keys'),
    agentId: 'Existing_Agent',
  };
  let assigned = false;
  const aliases = new Map([['existing', options.username]]);
  const state = {
    aliases: { getAll: () => [...aliases.keys()], setAndSave: async (key, value) => aliases.set(key, value) },
    orgs: {
      read: async () => ({
        clientId: 'test_consumer',
        privateKey: join(options.keyDirectory, 'server.key'),
        username: options.username,
      }),
    },
  };
  const connection = {
    instanceUrl: options.instanceUrl,
    accessToken: 'synthetic-token',
    refreshAuth: async () => {},
    query: async (sql) => ({
      records: sql.includes('FROM User')
        ? [{ Id: '005000000000001AAA', IsActive: true }]
        : assigned
          ? [{ Id: 'assignment' }]
          : [],
    }),
    request: async () => ({ status: 'ACTIVE' }),
    metadata: {
      read: async (type, name) => {
        try {
          await stat(deployedFile);
        } catch {
          return {};
        }
        const common = { fullName: name, label: name, externalClientApplication: options.appName };
        if (type === 'ExternalClientApplication') return common;
        if (type === 'ExtlClntAppGlobalOauthSettings')
          return {
            ...common,
            certificate: await readFile(join(options.keyDirectory, 'server.crt'), 'utf8'),
            consumerKey: 'test_consumer',
            isClientCredentialsFlowEnabled: false,
            isCodeCredFlowEnabled: false,
            isDeviceFlowEnabled: false,
            isTokenExchangeEnabled: false,
            isNamedUserJwtEnabled: false,
          };
        if (type === 'ExtlClntAppOauthSettings')
          return { ...common, commaSeparatedOauthScopes: 'Api,RefreshToken,CDPQuery,CDPIngest' };
        if (type === 'ExtlClntAppOauthConfigurablePolicies')
          return {
            ...common,
            permittedUsersPolicyType: 'AdminApprovedPreAuthorized',
            commaSeparatedPermissionSet: 'ACE_CLI_User',
            ipRelaxationPolicyType: 'Enforce',
          };
        if (type === 'ExtlClntAppConfigurablePolicies')
          return { ...common, isEnabled: true, isOauthPluginEnabled: true };
        return { fullName: name, label: name };
      },
    },
  };
  const org = {
    getOrgId: () => options.orgId,
    getUsername: () => options.admin,
    getConnection: () => connection,
    refreshAuth: async () => {},
  };
  try {
    await writeFile(
      join(directory, 'sf'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args.slice(0,3))+'\\n');
if (args[0] === 'project') {
 if (fs.existsSync(${JSON.stringify(failureFile)})) { console.log('uncertain'); process.exit(1); }
 const project = JSON.parse(fs.readFileSync('sfdx-project.json'));
 if (project.sourceApiVersion !== '68.0') process.exit(2);
 fs.writeFileSync(${JSON.stringify(deployedFile)}, 'yes');
 console.log(JSON.stringify({status:0,result:{id:'0Af000000000001AAA',status:'Succeeded'}}));
} else { console.log(JSON.stringify({status:0,result:{}})); }
`,
      { mode: 0o700 },
    );
    process.env.PATH = `${directory}:${previousPath}`;
    t.mock.method(StateAggregator, 'getInstance', async () => state);
    t.mock.method(StateAggregator, 'clearInstance', () => {
      aliases.clear();
    });
    t.mock.method(Org, 'create', async () => org);
    t.mock.method(AceTransport.prototype, 'exchange', async () => ({
      origin: 'https://runtime.example.com',
      token: 'synthetic-runtime',
    }));
    t.mock.method(AceTransport.prototype, 'execute', async () => ({ httpStatus: 200, data: { conversations: [] } }));
    const run = async () => {
      const command = new Setup([], {});
      command.jsonEnabled = () => true;
      command.parse = async () => ({
        flags: {
          'target-org': org,
          username: options.username,
          'app-name': options.appName,
          alias: options.alias,
          'agent-id': options.agentId,
          'key-dir': options.keyDirectory,
          'allow-write': true,
          'no-prompt': true,
          confirm: setupPlan(options).fingerprint,
        },
      });
      return command.run();
    };
    const fresh = await run();
    assert.equal(fresh.reused, false);
    assert.equal(fresh.permissionAssigned, true);
    assert.equal(fresh.runtimeCheck.httpStatus, 200);
    assert.equal(aliases.get('existing'), options.username);
    assert.equal((await stat(join(options.keyDirectory, 'setup.json'))).mode & 0o077, 0);
    const originalKey = await readFile(join(options.keyDirectory, 'server.key'));
    assigned = true;
    const reused = await run();
    assert.equal(reused.reused, true);
    assert.equal(reused.permissionAssigned, false);
    assert.deepEqual(await readFile(join(options.keyDirectory, 'server.key')), originalKey);
    const calls = (await readFile(callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls, [
      ['project', 'deploy', 'start'],
      ['org', 'assign', 'permset'],
      ['org', 'login', 'jwt'],
      ['org', 'login', 'jwt'],
    ]);
    await rm(deployedFile);
    await writeFile(failureFile, 'yes');
    await assert.rejects(run(), { name: 'SetupOutcomeUnknown' });
    const after = (await readFile(callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(after.length, calls.length + 1, 'Uncertain deployment must not retry or continue to login');
  } finally {
    process.env.PATH = previousPath;
    t.mock.restoreAll();
    await rm(directory, { recursive: true, force: true });
  }
});
