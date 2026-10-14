import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const env = {
  ...process.env,
  ACE_RUNTIME_ORIGIN: 'https://synthetic.example',
  ACE_RUNTIME_TOKEN: 'synthetic-runtime-token',
  SF_AUTOUPDATE_DISABLE: 'true',
};
function cli(args, preload, environment = {}) {
  const result = spawnSync(process.execPath, [...(preload ? ['--import', preload] : []), runner, ...args, '--json'], {
    env: { ...env, ...environment },
    encoding: 'utf8',
    timeout: 20000,
  });
  assert(!result.error, result.error?.message);
  assert(!result.stdout.includes('synthetic-runtime-token'), 'credential leaked to stdout');
  assert(!result.stderr.includes('synthetic-runtime-token'), 'credential leaked to stderr');
  assert(result.stdout.trim(), `CLI returned no JSON (exit ${result.status}): ${result.stderr}`);
  return { code: result.status, output: JSON.parse(result.stdout) };
}
test('actual CLI dry-run, disabled writes, fingerprint approval, and malformed body', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ace-cli-test-'));
  try {
    const mock = join(folder, 'fetch.mjs');
    await writeFile(
      mock,
      `globalThis.fetch = async (url, init) => { if (String(url) !== 'https://synthetic.example/api/v1/agentic/conversations/c/close' || init.method !== 'POST') throw Error('Unexpected request'); return Response.json({closed:true},{status:202}); };`,
    );
    const args = ['ace', 'conversation', 'close', '--agent-id', 'a', '--conversation-id', 'c'];
    const planned = cli([...args, '--dry-run']);
    assert.equal(planned.code, 0);
    assert.equal(planned.output.result.state, 'planned');
    const fingerprint = planned.output.result.plan.fingerprint;
    assert.equal(cli(args).output.name, 'WritesDisabled');
    assert.equal(cli([...args, '--allow-write']).output.name, 'ConfirmationRequired');
    assert.equal(
      cli([...args, '--allow-write', '--no-prompt', '--confirm', 'wrong']).output.name,
      'ConfirmationRequired',
    );
    const executed = cli([...args, '--allow-write', '--no-prompt', '--confirm', fingerprint], mock);
    assert.equal(executed.code, 0);
    assert.equal(executed.output.status, 0);
    assert.equal(executed.output.result.state, 'accepted');
    assert.equal(executed.output.result.httpStatus, 202);
    const body = join(folder, 'bad.json');
    await writeFile(body, 'not-json: private-value');
    const invalid = cli([
      'ace',
      'memory',
      'create',
      '--profile-id',
      'p',
      '--profile-type',
      'employee',
      '--category',
      'verified',
      '--body-file',
      body,
      '--dry-run',
    ]);
    assert.equal(invalid.output.name, 'InvalidBodyFile');
    assert(!JSON.stringify(invalid.output).includes('private-value'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('actual CLI schema and required flag errors use Salesforce JSON envelopes', () => {
  const schema = cli(['ace', 'schema']);
  assert.equal(schema.output.status, 0);
  assert.equal(schema.output.result.operations.length, 18);
  const missing = cli(['ace', 'context', 'get', '--dry-run']);
  assert.notEqual(missing.code, 0);
  assert.notEqual(missing.output.status, 0);
});
test('actual CLI JSON body from stdin stays offline in dry-run', () => {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      'ace',
      'memory',
      'create',
      '--profile-id',
      'p',
      '--profile-type',
      'employee',
      '--category',
      'verified',
      '--body-file',
      '-',
      '--dry-run',
      '--json',
    ],
    { env, input: '{"memories":[{"content":"exact"}]}', encoding: 'utf8', timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).result.plan.body.memories[0].content, 'exact');
});

test('actual CLI continuation preserves filters, source, target, version, and timeout', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ace-cli-pagination-'));
  try {
    const mock = join(folder, 'fetch.mjs');
    await writeFile(
      mock,
      `import { Org } from ${JSON.stringify(import.meta.resolve('@salesforce/core'))}; Org.create = async () => undefined; const originalFetch = globalThis.fetch; globalThis.fetch = async (url, init) => String(url).startsWith('https://synthetic.example/') ? Response.json({ conversationId: 'c', sessions: [{sessionId: 's', status: 'CLOSED'}], nextPageToken: 'page-two' }) : originalFetch(url, init);`,
    );
    const result = cli(
      [
        'ace',
        'session',
        'list',
        '--agent-id',
        'a',
        '--conversation-id',
        'c',
        '--owner-id',
        'owner',
        '--owner-type',
        'employee',
        '--source',
        'conversation',
        '--status',
        'CLOSED',
        '--fields',
        'id',
        '--api-version',
        '67.0',
        '--timeout',
        '120',
      ],
      mock,
    );
    assert.equal(result.code, 0);
    assert.deepEqual(result.output.result.continuation, {
      command: 'ace session list',
      flags: {
        'agent-id': 'a',
        'conversation-id': 'c',
        'owner-id': 'owner',
        'owner-type': 'employee',
        status: 'CLOSED',
        fields: ['id'],
        'page-token': 'page-two',
        source: 'conversation',
        'runtime-origin': 'https://synthetic.example',
        'api-version': '67.0',
        timeout: 120,
      },
    });
    assert.deepEqual(result.output.result.data.sessions, [{ id: 's' }]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('actual CLI exchanges the org grant when explicit runtime credentials are absent', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ace-cli-auth-'));
  try {
    const mock = join(folder, 'auth.mjs');
    await writeFile(
      mock,
      `import assert from 'node:assert/strict';
      import { Org } from ${JSON.stringify(import.meta.resolve('@salesforce/core'))};
      Org.create = async () => ({ getOrgId: () => 'org', getUsername: () => 'user@example.test', refreshAuth: async () => {}, getConnection: () => ({instanceUrl:'https://org.example',accessToken:'org-secret'}) });
      globalThis.fetch = async (url, init) => {
        if (url.origin === 'https://org.example') {
          assert.equal(url.pathname, '/services/a360/token');
          assert.equal(init.body.get('subject_token'), 'org-secret');
          return Response.json({access_token:'runtime-secret',instance_url:'tenant.salesforce.com'});
        }
        assert.equal(url.origin, 'https://tenant.salesforce.com');
        assert.equal(init.headers.Authorization, 'Bearer runtime-secret');
        return Response.json({conversations:[]});
      };`,
    );
    const args = [
      'ace',
      'conversation',
      'list',
      '--target-org',
      'example',
      '--agent-id',
      'agent',
      '--owner-id',
      'owner',
      '--owner-type',
      'employee',
    ];
    const result = cli(args, mock, { ACE_RUNTIME_ORIGIN: '', ACE_RUNTIME_TOKEN: '' });
    assert.equal(result.code, 0);
    assert.deepEqual(result.output.result.data, { conversations: [] });
    assert(!JSON.stringify(result.output).includes('secret'));
    for (const credentials of [
      { ACE_RUNTIME_ORIGIN: '', ACE_RUNTIME_TOKEN: 'runtime-secret' },
      { ACE_RUNTIME_ORIGIN: 'https://tenant.salesforce.com', ACE_RUNTIME_TOKEN: '' },
    ])
      assert.equal(cli(args, mock, credentials).output.name, 'RuntimeAuthRequired');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
