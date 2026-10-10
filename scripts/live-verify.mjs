import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const org = process.env.ACE_LIVE_ORG;
const owner = process.env.ACE_LIVE_OWNER;
assert(org && owner, 'Set ACE_LIVE_ORG and ACE_LIVE_OWNER for an explicitly authorized org/employee.');
assert.equal(process.env.ACE_LIVE_ALLOW_WRITES, 'yes', 'Live mutations must be explicitly enabled.');
assert.equal(process.env.ACE_LIVE_ALLOW_DELETE, 'yes', 'Disposable-resource cleanup must be explicitly enabled.');
const id = randomUUID().replaceAll('-', '').slice(0, 16);
const agent = `ace_cli_acceptance_${id}`;
const conversation = `cli-conversation-${id}`;
const session = `cli-session-${id}`;
const message = `cli-message-${id}`;
const folder = mkdtempSync(join(tmpdir(), 'ace-live-'));
const report = {
  startedAt: new Date().toISOString(),
  commands: {},
  attempts: [],
  assertions: {},
  retained: {},
  automaticWriteRetries: 0,
  intended: { agent, conversation, session },
};
const reportPath = process.env.ACE_LIVE_REPORT ?? join(folder, 'report.json');
const common = ['--target-org', org, '--api-version', process.env.ACE_LIVE_API_VERSION ?? '67.0'];
const base = [...common, '--agent-id', agent];
const conv = [...base, '--conversation-id', conversation];
const sess = [...conv, '--session-id', session];
const own = ['--owner-id', owner, '--owner-type', 'employee'];
const profile = [...common, '--profile-id', owner, '--profile-type', 'employee', '--category', 'sys_PROFILE_FACT'];
const persist = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
function run(command, flags = [], body, execute = false) {
  const args = [...command.split(' '), ...flags, '--json'];
  if (command === 'ace session list') args.push('--source', process.env.ACE_LIVE_SESSION_SOURCE ?? 'index');
  if (body) {
    const file = join(folder, `${randomUUID()}.json`);
    writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
    args.push('--body-file', file);
  }
  function call(extra = []) {
    let raw;
    try {
      raw = execFileSync(process.env.ACE_LIVE_SF ?? 'sf', [...args, ...extra], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 45000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      raw = error.stdout;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { status: 1, name: 'UncertainProcessOutcome' };
    }
  }
  let r;
  if (execute) {
    const plan = call(['--dry-run']);
    assert.equal(plan.status, 0, `Cannot validate ${command}`);
    r = call(['--allow-write', '--no-prompt', '--confirm', plan.result.plan.fingerprint]);
  } else r = call();
  const row = {
    exitStatus: r.status,
    httpStatus: r.result?.httpStatus ?? (Number(r.message?.match(/HTTP (\d+)/)?.[1]) || undefined),
    error: r.name,
    state: r.result?.state,
    source: r.result?.source,
    responseReceived: Boolean(r.result?.httpStatus || /HTTP \d+/.test(r.message ?? '')),
  };
  report.commands[command] = row;
  report.attempts.push({ command, ...row });
  persist();
  console.log(JSON.stringify({ command, ...row }));
  return r;
}
async function poll(command, flags, predicate) {
  let r;
  for (let i = 0; i < 12; i++) {
    r = run(command, flags);
    if (r.status === 0 && predicate(r.result.data)) return r;
    if (i < 11) await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  return r;
}
function success(r) {
  assert.equal(r.status, 0, 'Live mutation rejected or uncertain; read state before retrying.');
  return r.result.data;
}
try {
  run('ace schema');
  success(run('ace agent list', common));
  success(
    run(
      'ace agent create',
      common,
      { name: agent, label: 'CLI acceptance verification', dataspaceName: 'default', configuration: {} },
      true,
    ),
  );
  report.retained.agent = agent;
  persist();
  const registration = await poll('ace agent get', base, (d) => d.status === 'ACTIVE');
  assert.equal(registration.result?.data?.status, 'ACTIVE', 'Registration not ready');
  const ready = await poll('ace conversation list', [...base, ...own], () => true);
  success(ready);
  success(
    run(
      'ace conversation create',
      base,
      {
        conversationId: conversation,
        conversationOwnerId: owner,
        ownerType: 'employee',
        name: 'CLI acceptance verification',
      },
      true,
    ),
  );
  report.retained.conversation = conversation;
  persist();
  success(
    run(
      'ace session create',
      conv,
      {
        sessionId: session,
        conversationOwnerId: owner,
        ownerType: 'employee',
        participants: [{ id: owner, type: 'employee', role: 'owner', startTime: new Date().toISOString() }],
      },
      true,
    ),
  );
  success(
    run('ace participant add', sess, { participants: [{ id: agent, type: 'agent', role: 'participant' }] }, true),
  );
  success(
    run(
      'ace entry add',
      conv,
      {
        sessionId: session,
        entries: [
          {
            id: message,
            participantId: owner,
            category: 'Message',
            type: 'user_message',
            content:
              'Verify the ACE CLI operation lifecycle. This is an operator verification request, not a personal fact.',
          },
        ],
      },
      true,
    ),
  );
  const hasMessage = (data) =>
    data?.sessions?.some((s) => s.sessionId === session && s.entries?.some((e) => e.id === message)) === true;
  const readback = await poll('ace conversation get', [...conv, ...own, '--scope', 'all'], hasMessage);
  report.assertions.messagePersisted = readback.status === 0 && hasMessage(readback.result?.data);
  const listed = await poll(
    'ace session list',
    [...conv, ...own],
    (d) => d.sessions?.some((s) => (s.id ?? s.sessionId) === session) === true,
  );
  report.assertions.sessionEnumerated =
    listed.status === 0 && listed.result?.data?.sessions?.some((s) => (s.id ?? s.sessionId) === session) === true;
  const context = run('ace context get', [...conv, ...own, '--mode', 'fast']);
  report.assertions.contextAssembled =
    context.status === 0 &&
    typeof context.result?.data?.contextId === 'string' &&
    Array.isArray(context.result?.data?.userContext) &&
    context.result.data.userContext.length > 0;
  success(run('ace memory read', profile));
  const memory = success(
    run(
      'ace memory create',
      profile,
      { memories: [{ content: `CLI acceptance ${id}; operator verification only.` }] },
      true,
    ),
  );
  const memoryId = memory.memories?.[0]?.memoryId;
  assert(memoryId, 'No memory ID returned');
  report.retained.memoryId = memoryId;
  persist();
  const updated = success(
    run(
      'ace memory update',
      profile,
      { memories: [{ memoryId, content: `CLI acceptance ${id}; update verified; operator verification only.` }] },
      true,
    ),
  );
  const replacement = updated.memories?.[0]?.memoryId;
  assert(replacement, 'No replacement memory ID returned');
  report.retained.memoryId = replacement;
  persist();
  const read = run('ace memory read', profile);
  report.assertions.memoryUpdated =
    read.result?.data?.memories?.some((m) => m.memoryId === replacement && m.content.includes('update verified')) ??
    false;
  success(run('ace memory delete', profile, { memories: [{ memoryId: replacement }] }, true));
  const removed = run('ace memory read', profile);
  report.assertions.memoryDeleted =
    removed.status === 0 &&
    Array.isArray(removed.result?.data?.memories) &&
    !removed.result.data.memories.some((m) => m.memoryId === replacement);
  if (report.assertions.memoryDeleted) delete report.retained.memoryId;
  success(run('ace session close', sess, undefined, true));
  success(run('ace conversation close', conv, undefined, true));
  const closed = await poll(
    'ace conversation get',
    [...conv, ...own, '--scope', 'all'],
    (d) => d.status === 'CLOSED' && d.sessions?.some((s) => s.sessionId === session && s.status === 'CLOSED'),
  );
  report.assertions.conversationClosed = closed.result?.data?.status === 'CLOSED';
  report.assertions.sessionClosed =
    closed.result?.data?.sessions?.some((s) => s.sessionId === session && s.status === 'CLOSED') ?? false;
  const closedIndex = run('ace session list', [...conv, ...own, '--status', 'CLOSED']);
  report.assertions.closedSessionEnumerated =
    closedIndex.status === 0 &&
    closedIndex.result.data.sessions?.some((s) => (s.id ?? s.sessionId) === session) === true;
  const conversationIndex = run('ace conversation list', [...base, ...own]);
  report.assertions.conversationEnumerated =
    conversationIndex.status === 0 &&
    conversationIndex.result.data.conversations?.some((c) => (c.id ?? c.conversationId) === conversation) === true;
  success(run('ace agent delete', base, undefined, true));
  const remaining = run('ace agent list', [...common, '--limit', '200', '--offset', '0']);
  const inventory = remaining.result?.data;
  report.assertions.agentDeleted =
    remaining.status === 0 &&
    Array.isArray(inventory?.agents) &&
    Number.isInteger(inventory.totalSize) &&
    inventory.totalSize === inventory.agents.length &&
    !inventory.agents.some((item) => item.name === agent);
  if (report.assertions.agentDeleted) {
    delete report.retained.agent;
    delete report.retained.conversation;
  }
} catch (error) {
  report.stopped = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.allCommandsSuccessful =
    Object.keys(report.commands).length === 19 && Object.values(report.commands).every((r) => r.exitStatus === 0);
  report.allAssertionsPassed =
    Object.keys(report.assertions).length === 10 && Object.values(report.assertions).every(Boolean);
  persist();
  if (!report.allCommandsSuccessful || !report.allAssertionsPassed) process.exitCode = 1;
  // Preserve receipts and uncertain resource identifiers; never silently clean up an uncertain write.
  if (process.env.ACE_LIVE_REPORT) rmSync(folder, { recursive: true, force: true });
  console.log(
    JSON.stringify({ report: reportPath, complete: report.allCommandsSuccessful && report.allAssertionsPassed }),
  );
}
