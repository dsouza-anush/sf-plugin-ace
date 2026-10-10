import test from 'node:test';
import assert from 'node:assert/strict';
import { AceTransport, planSessionProjection, projectSessions } from '../lib/client.js';
import { operationFor } from '../lib/contracts.js';

const values = { 'agent-id': 'a', 'conversation-id': 'c', 'owner-id': 'owner', 'owner-type': 'employee' };
test('explicit conversation source uses governed graph route and projects actual closed sessions', async () => {
  const plan = planSessionProjection({ ...values, status: 'CLOSED' }, 'authorized');
  const transport = new AceTransport(async (url, init) => {
    assert.equal(url.pathname, '/api/v1/agentic/conversations/c');
    assert.equal(url.searchParams.get('owner_id'), 'owner');
    assert.equal(url.searchParams.get('owner_type'), 'employee');
    assert.equal(url.searchParams.get('scope'), 'all');
    assert.equal(url.searchParams.has('status'), false);
    assert.equal(init.headers.agent_id, 'a');
    return new Response(
      JSON.stringify({
        conversationId: 'c',
        sessions: [
          { sessionId: 'closed', status: 'CLOSED', entries: [{ content: 'private message' }] },
          { sessionId: 'open', status: 'ACTIVE', startTime: '2026-10-10T00:00:00Z' },
        ],
        nextPageToken: 'next',
      }),
    );
  });
  const result = await transport.execute(
    plan,
    { origin: 'https://tenant.example', token: 'test' },
    operationFor('ace session list'),
    values,
  );
  assert.equal(result.source, 'conversation');
  assert.equal(result.operation, 'ace session list');
  assert.deepEqual(result.data, {
    conversationId: 'c',
    sessions: [{ id: 'closed', status: 'CLOSED' }],
    nextPageToken: 'next',
  });
  assert.equal(result.continuation.flags['page-token'], 'next');
  assert(!JSON.stringify(result).includes('private message'));
  assert(!('startTime' in result.data.sessions[0]));
});
test('conversation projection rejects unsupported filters before a request', () => {
  for (const flag of ['participant-id', 'time-range'])
    assert.throws(() => planSessionProjection({ ...values, [flag]: 'x' }, 'authorized'), {
      name: 'UnsupportedProjectionFilter',
    });
  assert.throws(() => planSessionProjection({ ...values, fields: ['unsupported'] }, 'authorized'), {
    name: 'UnsupportedProjectionField',
  });
});
test('projection supports explicit summary fields and rejects malformed graph data', () => {
  assert.deepEqual(
    projectSessions({ conversationId: 'c', sessions: [{ sessionId: 's', status: 'CLOSED' }] }, { fields: ['id'] }),
    { conversationId: 'c', sessions: [{ id: 's' }] },
  );
  for (const data of [null, {}, { sessions: [null] }, { sessions: [{ status: 'CLOSED' }] }])
    assert.throws(() => projectSessions(data, {}), { name: 'InvalidSessionProjection' });
});
