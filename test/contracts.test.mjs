import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { operations, operationFor, bodies } from '../lib/contracts.js';
import { AceTransport, planRequest, requireWriteApproval, origin } from '../lib/client.js';

const values = {
  'agent-id': 'agent/one',
  'conversation-id': 'conv/one',
  'session-id': 'session/one',
  'owner-id': 'owner',
  'owner-type': 'employee',
  'profile-id': 'profile',
  'profile-type': 'employee',
  category: 'verified-category',
  limit: 25,
  offset: 0,
  filters: '[status=Active]',
  'order-by': 'DESC',
  status: 'open',
  'time-range': 'tenant-expression',
  fields: ['id', 'name'],
  'participant-id': 'participant',
  'page-token': 'next+page=',
  scope: 'traces',
  mode: 'fast',
  'latency-sensitivity': 'low',
  'token-budget': 50,
};
const payloads = {
  agent: {
    name: 'example',
    label: 'Example',
    dataspaceName: 'default',
    configuration: { profileDmos: [{ name: 'Profile' }], contextDataSources: { dataGraphs: [{ name: 'Graph' }] } },
  },
  conversation: {
    conversationId: 'conversation',
    conversationOwnerId: 'owner',
    ownerType: 'employee',
    channel: { type: 'chat', id: 'channel' },
    variable: { source: 'test' },
  },
  session: {
    sessionId: 'session',
    conversationOwnerId: 'owner',
    ownerType: 'employee',
    participants: [
      { id: 'owner', type: 'employee', role: 'owner', startTime: '2026-10-09T01:00:00Z', endTime: null, orgId: 'org' },
    ],
    variable: { nested: { turn: 1 } },
  },
  participants: { participants: [{ id: 'agent', type: 'external-custom-type', role: 'participant' }] },
  entries: {
    sessionId: 'session',
    entries: [
      { participantId: 'agent', category: 'Trace', type: 'tool_call', variable: { tool: 'lookup', args: { id: 1 } } },
      {
        participantId: 'owner',
        content: 'Hello',
        attachments: [{ contentType: 'image/png', contentUrl: 'https://files.example/image.png' }],
      },
    ],
  },
  memoryCreate: { memories: [{ content: '  exact content  ' }] },
  memoryUpdate: { memories: [{ memoryId: 'old', content: 'replacement' }] },
  memoryDelete: { memories: [{ memoryId: 'old' }] },
};
// Independent expected method/route matrix from the published operation references.
const cases = [
  ['ace agent list', 'GET', '/services/data/v68.0/ssot/agentic/agents'],
  ['ace agent get', 'GET', '/services/data/v68.0/ssot/agentic/agent/agent%2Fone'],
  ['ace agent create', 'POST', '/services/data/v68.0/ssot/agentic/agent'],
  ['ace agent delete', 'DELETE', '/services/data/v68.0/ssot/agentic/agent/agent%2Fone'],
  ['ace conversation list', 'GET', '/api/v1/agentic/conversations'],
  ['ace conversation get', 'GET', '/api/v1/agentic/conversations/conv%2Fone'],
  ['ace conversation create', 'POST', '/api/v1/agentic/conversations'],
  ['ace conversation close', 'POST', '/api/v1/agentic/conversations/conv%2Fone/close'],
  ['ace session list', 'GET', '/api/v1/agentic/conversations/conv%2Fone/sessions'],
  ['ace session create', 'POST', '/api/v1/agentic/conversations/conv%2Fone/sessions'],
  ['ace session close', 'POST', '/api/v1/agentic/conversations/conv%2Fone/sessions/session%2Fone/close'],
  ['ace participant add', 'POST', '/api/v1/agentic/conversations/conv%2Fone/sessions/session%2Fone/participants'],
  ['ace entry add', 'POST', '/api/v1/agentic/conversations/conv%2Fone/entries'],
  ['ace memory read', 'GET', '/api/v1/agentic/memory'],
  ['ace memory create', 'POST', '/api/v1/agentic/memory'],
  ['ace memory update', 'POST', '/api/v1/agentic/memory'],
  ['ace memory delete', 'DELETE', '/api/v1/agentic/memory'],
  ['ace context get', 'GET', '/api/v1/agentic/context'],
];
for (const [command, method, path] of cases)
  test(`${command}: wire contract and status`, async () => {
    const op = operationFor(command);
    const plan = planRequest(op, values, op.body ? payloads[op.body] : undefined, 'synthetic');
    let calls = 0;
    const transport = new AceTransport(async (url, init) => {
      calls++;
      assert.equal(url.pathname, path);
      assert.equal(init.method, method);
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
      assert(init.signal instanceof AbortSignal);
      assert.deepEqual(
        init.body ? JSON.parse(init.body) : undefined,
        op.body ? bodies[op.body].parse(payloads[op.body]) : undefined,
      );
      if (command.startsWith('ace memory')) {
        assert.equal(url.searchParams.get('profile_id'), 'profile');
        assert.equal(url.searchParams.get('profile_type'), 'employee');
        assert.equal(url.searchParams.get('category'), 'verified-category');
      }
      if (command === 'ace context get') {
        assert.equal(url.searchParams.get('agent_id'), 'agent/one');
        assert.equal(init.headers.agent_id, undefined);
        assert.equal(init.headers['ctx-agent-id'], 'agent/one');
        assert.equal(url.searchParams.get('token_budget'), '50');
      } else if (op.surface === 'runtime') assert.equal(init.headers.agent_id, 'agent/one');
      if (command.endsWith(' list') && op.surface === 'runtime') {
        assert.deepEqual(url.searchParams.getAll('fields'), ['id', 'name']);
        assert.equal(url.searchParams.get('page_token'), 'next+page=');
        assert.equal(url.searchParams.get('owner_id'), 'owner');
      }
      return new Response(
        JSON.stringify({
          nextPageToken: op.paginated ? 'page-2' : undefined,
          warnings: ['partial graph'],
          unexpectedFutureField: 42,
        }),
        { status: method === 'POST' && !command.includes('memory') && !command.includes('agent') ? 202 : 200 },
      );
    });
    const result = await transport.execute(
      plan,
      { origin: 'https://tenant.example', token: 'synthetic-token' },
      op,
      values,
    );
    assert.equal(calls, 1);
    assert.equal(result.data.unexpectedFutureField, 42);
    assert.deepEqual(result.data.warnings, ['partial graph']);
    assert.equal(result.state, result.httpStatus === 202 ? 'accepted' : 'responded');
    if (op.paginated) {
      assert.equal(result.continuation.flags['page-token'], 'page-2');
      assert.equal(result.continuation.flags['owner-id'], 'owner');
      assert.equal(result.continuation.flags['agent-id'], 'agent/one');
    } else assert.equal(result.continuation, undefined);
  });

test('all 14 runtime method/path pairs and parameters match independent published field tables', async () => {
  const snapshot = JSON.parse(await readFile(new URL('./fixtures/public-runtime-contracts.json', import.meta.url)));
  const runtime = operations.filter((op) => op.surface === 'runtime');
  assert.equal(runtime.length, 14);
  for (const published of snapshot.operations) {
    const normalize = (path) => path.replaceAll(/\{[^}]+\}/g, '{}');
    const matches = runtime.filter(
      (op) => op.method === published.method && normalize('/api/v1/agentic' + op.path) === normalize(published.path),
    );
    assert(matches.length > 0, published.url);
    for (const op of matches) {
      const required = (published.tables['Query Parameters'] ?? []).map((p) => p.Parameter);
      for (const name of required)
        assert(
          op.parameters.some((p) => p.location === 'query' && p.wire === name),
          `${op.command}: missing ${name}`,
        );
    }
  }
});

test('body validation catches missing payloads and rejects unknown fields', () => {
  for (const op of operations.filter((op) => op.body)) {
    assert.throws(() => planRequest(op, values, {}, 'synthetic'), { name: 'InvalidBody' });
    assert.throws(
      () => planRequest(op, values, { ...payloads[op.body], unknownField: 'secret' }, 'synthetic'),
      (error) => error.name === 'InvalidBody' && !error.message.includes('secret'),
    );
  }
  assert.throws(() => bodies.entries.parse({ sessionId: 's', entries: [{ participantId: 'p', category: 'Message' }] }));
  assert.equal(bodies.memoryCreate.parse(payloads.memoryCreate).memories[0].content, '  exact content  ');
  const { dataspaceName, ...agentBody } = payloads.agent;
  assert(bodies.agent.safeParse({ ...agentBody, dataSpaceName: dataspaceName }).success);
  assert(!bodies.agent.safeParse({ ...payloads.agent, dataSpaceName: 'other' }).success);
});

test('path/query/header validation prevents traversal and malformed inputs', () => {
  for (const bad of ['.', '..', '\r\nAuthorization: leaked'])
    assert.throws(() => planRequest(operationFor('ace agent get'), { 'agent-id': bad }, undefined, 'test'));
  assert.throws(
    () =>
      planRequest(
        operationFor('ace context get'),
        { 'agent-id': 'a', 'conversation-id': 'c', 'owner-id': 'p' },
        undefined,
        'test',
      ),
    { name: 'MissingOwnerType' },
  );
  for (const limit of [0, 201, 1.5])
    assert.throws(() => planRequest(operationFor('ace agent list'), { limit }, undefined, 'test'));
  assert.throws(() => planRequest(operationFor('ace agent list'), {}, undefined, 'test', '65.0'));
  assert.throws(() => planRequest(operationFor('ace agent list'), {}, undefined, 'test', '68/evil'));
  for (const bad of [
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com/?secret=x',
  ])
    assert.throws(() => origin(bad), { name: 'InvalidOrigin' });
});

test('writes require both enablement and confirmation, with target/body-bound fingerprints', () => {
  const op = operationFor('ace memory create');
  const plan = planRequest(op, values, payloads.memoryCreate, 'target-a');
  assert.throws(() => requireWriteApproval(plan, false, true), { name: 'WritesDisabled' });
  assert.throws(() => requireWriteApproval(plan, true, false), { name: 'ConfirmationRequired' });
  requireWriteApproval(plan, true, true);
  assert.notEqual(plan.fingerprint, planRequest(op, values, payloads.memoryCreate, 'target-b').fingerprint);
  assert.notEqual(
    plan.fingerprint,
    planRequest(op, values, { memories: [{ content: 'changed' }] }, 'target-a').fingerprint,
  );
});

test('transport errors never expose tokens or upstream bodies and never retry', async () => {
  for (const command of ['ace memory read', 'ace memory delete']) {
    const op = operationFor(command),
      plan = planRequest(op, values, op.body ? payloads[op.body] : undefined, 'target');
    for (const status of [401, 403, 404, 409, 429, 500, 503]) {
      let calls = 0;
      const transport = new AceTransport(async () => {
        calls++;
        return new Response('secret-token tenant data', { status });
      });
      await assert.rejects(
        transport.execute(plan, { origin: 'https://tenant.example', token: 'secret-token' }, op, values),
        (error) => error.name === `AceHttp${status}` && !error.message.includes('secret-token'),
      );
      assert.equal(calls, 1);
    }
    let calls = 0;
    const transport = new AceTransport(async () => {
      calls++;
      throw new Error('secret-token');
    });
    await assert.rejects(
      transport.execute(plan, { origin: 'https://tenant.example', token: 'secret-token' }, op, values),
      { name: op.method === 'GET' ? 'TransportFailed' : 'WriteOutcomeUnknown' },
    );
    assert.equal(calls, 1);
  }
});

test('exchange uses published grant and returned tenant, without exposing secrets', async () => {
  const transport = new AceTransport(async (url, init) => {
    assert.equal(String(url), 'https://org.example/services/a360/token');
    assert.equal(init.body.get('grant_type'), 'urn:salesforce:grant-type:external:cdp');
    assert.equal(init.body.get('subject_token'), 'synthetic-sf-token');
    assert.equal(init.redirect, 'error');
    return Response.json({
      access_token: 'synthetic-runtime-token',
      instance_url: 'tenant.salesforce.com',
      token_type: 'Bearer',
    });
  });
  assert.deepEqual(await transport.exchange({ origin: 'https://org.example', token: 'synthetic-sf-token' }), {
    origin: 'https://tenant.salesforce.com',
    token: 'synthetic-runtime-token',
  });
  for (const reply of [
    {},
    { access_token: 'x', instance_url: 'evil.example' },
    { access_token: 'x', instance_url: 'https://user:pass@tenant.salesforce.com' },
    { access_token: 'x', instance_url: 'tenant.salesforce.com', token_type: 'Basic' },
  ]) {
    await assert.rejects(
      new AceTransport(async () => Response.json(reply)).exchange({ origin: 'https://org.example', token: 'secret' }),
      { name: 'InvalidRuntimeSession' },
    );
  }
});

test('malformed success response preserves uncertain-write recovery boundary', async () => {
  const op = operationFor('ace session close'),
    plan = planRequest(op, values, undefined, 'target');
  await assert.rejects(
    new AceTransport(async () => new Response('<html>private</html>', { status: 200 })).execute(
      plan,
      { origin: 'https://tenant.example', token: 'secret' },
      op,
      values,
    ),
    { name: 'InvalidResponse' },
  );
});
