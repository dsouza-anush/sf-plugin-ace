import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Read-only regression probe. Identifiers and credentials stay in the environment.
const required = ['ACE_LIVE_ORG', 'ACE_LIVE_OWNER', 'ACE_LIVE_AGENT', 'ACE_LIVE_CONVERSATION', 'ACE_LIVE_SESSION'];
for (const key of required) assert(process.env[key], `Set ${key} to an existing authorized resource.`);
const common = ['--target-org', process.env.ACE_LIVE_ORG, '--api-version', process.env.ACE_LIVE_API_VERSION ?? '67.0'];
const base = [...common, '--agent-id', process.env.ACE_LIVE_AGENT];
const conv = [...base, '--conversation-id', process.env.ACE_LIVE_CONVERSATION];
const own = ['--owner-id', process.env.ACE_LIVE_OWNER, '--owner-type', 'employee'];
const report = { checkedAt: new Date().toISOString(), readOnly: true, commands: [], assertions: {} };
function read(command, flags) {
  let raw;
  try {
    raw = execFileSync(process.env.ACE_LIVE_SF ?? 'sf', [...command.split(' '), ...flags, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    raw = error.stdout;
  }
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    result = { status: 1, name: 'UnreadableCommandResult' };
  }
  report.commands.push({
    command,
    exitStatus: result.status,
    httpStatus: result.result?.httpStatus ?? (Number(result.message?.match(/HTTP (\d+)/)?.[1]) || undefined),
    error: result.name,
  });
  return result;
}
const graph = read('ace conversation get', [...conv, ...own, '--scope', 'all']);
const conversations = read('ace conversation list', [...base, ...own]);
const sessionSource = process.env.ACE_LIVE_SESSION_SOURCE ?? 'index';
assert(['index', 'conversation'].includes(sessionSource), 'ACE_LIVE_SESSION_SOURCE must be index or conversation.');
const sessions = read('ace session list', [...conv, ...own, '--source', sessionSource]);
report.sessionSource = sessionSource;
const context = read('ace context get', [...conv, ...own, '--mode', 'fast']);
const targetSession = process.env.ACE_LIVE_SESSION;
report.assertions.sessionInGraph =
  graph.status === 0 && graph.result.data.sessions?.some((s) => s.sessionId === targetSession) === true;
report.assertions.conversationInIndex =
  conversations.status === 0 &&
  conversations.result.data.conversations?.some(
    (c) => (c.id ?? c.conversationId) === process.env.ACE_LIVE_CONVERSATION,
  ) === true;
report.assertions.sessionListed =
  sessions.status === 0 && sessions.result.data.sessions?.some((s) => (s.id ?? s.sessionId) === targetSession) === true;
report.assertions.contextAssembled =
  context.status === 0 &&
  typeof context.result.data.contextId === 'string' &&
  Array.isArray(context.result.data.userContext) &&
  context.result.data.userContext.length > 0;
report.sessionState = graph.result?.data?.sessions?.find((s) => s.sessionId === targetSession)?.status;
report.complete = report.commands.every((r) => r.exitStatus === 0) && Object.values(report.assertions).every(Boolean);
if (process.env.ACE_LIVE_REPORT)
  writeFileSync(process.env.ACE_LIVE_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (!report.complete) process.exitCode = 1;
