import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('read-only verifier follows pages and fails closed on repeated cursors and empty results', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ace-verifier-'));
  try {
    const executable = join(folder, 'sf');
    await writeFile(
      executable,
      `#!/usr/bin/env node
      const args = process.argv.slice(2);
      const command = args.slice(0, 3).join(' ');
      const mode = process.env.VERIFIER_CASE;
      let data;
      let continuation;
      if (mode === 'empty') data = null;
      else if (command === 'ace context get') data = {contextId:'context',userContext:[{}]};
      else {
        const key = command === 'ace conversation list' ? 'conversations' : 'sessions';
        const row = key === 'conversations' ? {conversationId:'conversation'} : {sessionId:'session',status:'CLOSED'};
        const secondPage = args.includes('--page-token');
        data = {[key]: secondPage && mode !== 'repeated' ? [row] : []};
        if (!secondPage || mode === 'repeated') continuation = {command,flags:{'page-token':'next'}};
      }
      console.log(JSON.stringify({status:0,result:{httpStatus:200,data,continuation}}));
    `,
      { mode: 0o700 },
    );
    const runner = fileURLToPath(new URL('../scripts/verify-existing.mjs', import.meta.url));
    for (const scenario of ['found', 'repeated', 'empty']) {
      const result = spawnSync(process.execPath, [runner], {
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          ACE_LIVE_SF: executable,
          ACE_LIVE_ORG: 'example',
          ACE_LIVE_OWNER: 'owner',
          ACE_LIVE_AGENT: 'agent',
          ACE_LIVE_CONVERSATION: 'conversation',
          ACE_LIVE_SESSION: 'session',
          ACE_LIVE_SESSION_SOURCE: 'conversation',
          ACE_LIVE_REPORT: '',
          VERIFIER_CASE: scenario,
        },
      });
      assert(!result.error, result.error?.message);
      const report = JSON.parse(result.stdout);
      assert.equal(report.complete, scenario === 'found');
      assert.equal(result.status, scenario === 'found' ? 0 : 1);
      assert.equal(report.commands.length, scenario === 'empty' ? 4 : 7);
      assert.equal(report.assertions.sessionListed, scenario === 'found');
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
