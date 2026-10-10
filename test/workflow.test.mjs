// Synthetic workflow proof: actual CLI processes, real HTTPS, ephemeral trusted CA.
// Only the Salesforce Org boundary is substituted. No production transport bypass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test(
  'full CLI workflow over HTTPS: 18 commands, approvals, readback, pagination and uncertain writes',
  { timeout: 180000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'ace-workflow-'));
    let server;
    try {
      await writeFile(
        join(folder, 'cert.cnf'),
        '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\n',
      );
      await exec('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(folder, 'key.pem'),
        '-out',
        join(folder, 'cert.pem'),
        '-days',
        '1',
        '-config',
        join(folder, 'cert.cnf'),
      ]);
      const state = {
        agent: null,
        conversation: null,
        session: null,
        memories: [],
        entries: [],
        requests: 0,
        failures: 0,
      };
      server = createServer(
        { key: await readFile(join(folder, 'key.pem')), cert: await readFile(join(folder, 'cert.pem')) },
        async (req, res) => {
          state.requests++;
          const url = new URL(req.url, 'https://localhost');
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
          const reply = (code, data) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          };
          if (req.headers.authorization !== 'Bearer fixture-secret') return reply(401, { error: 'unauthorized' });
          const path = url.pathname;
          if (path.startsWith('/services/data/v68.0/ssot/agentic/')) {
            if (path.endsWith('/agents'))
              return reply(200, { agents: state.agent ? [state.agent] : [], totalSize: state.agent ? 1 : 0 });
            if (req.method === 'POST') {
              state.agent = { ...body, id: 'a', status: 'Active' };
              return reply(201, state.agent);
            }
            if (req.method === 'DELETE') {
              state.agent = null;
              return reply(200, { deleted: true });
            }
            return reply(state.agent ? 200 : 404, state.agent || { error: 'absent' });
          }
          if (!path.startsWith('/api/v1/agentic/')) return reply(404, {});
          if (!path.endsWith('/context') && req.headers.agent_id !== 'a')
            return reply(400, { error: 'agent header missing' });
          if (path.endsWith('/memory')) {
            if (url.searchParams.get('profile_id') !== 'owner' || url.searchParams.get('category') !== 'fixture')
              return reply(400, {});
            if (req.method === 'POST') {
              state.memories = body.memories.map((m, i) => ({
                memoryId: m.memoryId ? 'replacement' : `m${i}`,
                content: m.content,
              }));
              return reply(200, { memories: state.memories });
            }
            if (req.method === 'DELETE') {
              state.memories = state.memories.filter((m) => !body.memories.some((d) => d.memoryId === m.memoryId));
            }
            return reply(200, { memories: state.memories });
          }
          if (path.endsWith('/context')) {
            if (url.searchParams.get('agent_id') !== 'a') return reply(400, {});
            return reply(200, {
              context: { entries: state.entries, memories: state.memories },
              warnings: ['synthetic context; no extraction inference'],
            });
          }
          if (path.endsWith('/conversations')) {
            if (req.method === 'POST') {
              state.conversation = { ...body, status: 'open' };
              return reply(201, state.conversation);
            }
            if (url.searchParams.get('owner_id') !== 'owner') return reply(403, {});
            return reply(200, {
              conversations: url.searchParams.has('page_token') ? [] : [state.conversation],
              ...(url.searchParams.has('page_token') ? {} : { nextPageToken: 'next+page=' }),
            });
          }
          if (path.endsWith('/participants')) {
            state.session.participants.push(...body.participants);
            return reply(200, { participants: state.session.participants });
          }
          if (path.endsWith('/entries')) {
            state.entries.push(...body.entries);
            return reply(202, { accepted: true });
          }
          if (path.endsWith('/sessions')) {
            if (req.method === 'POST') {
              state.session = { ...body, status: 'open' };
              return reply(201, state.session);
            }
            return reply(200, { sessions: [state.session] });
          }
          if (path.endsWith('/close')) {
            if (path.includes('/fail/')) {
              state.failures++;
              return reply(503, { error: 'temporary', secret: 'fixture-secret' });
            }
            if (path.includes('/sessions/')) state.session.status = 'closed';
            else state.conversation.status = 'closed';
            return reply(202, { accepted: true });
          }
          return reply(200, { ...state.conversation, sessions: [state.session], entries: state.entries });
        },
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const origin = `https://localhost:${server.address().port}`;
      const preload = join(folder, 'org.mjs');
      const core = import.meta.resolve('@salesforce/core');
      await writeFile(
        preload,
        `import {Org} from ${JSON.stringify(core)}; Org.create=async()=>({getOrgId:()=> 'fixture',getUsername:()=> 'fixture@example.test',refreshAuth:async()=>{},getConnection:()=>({instanceUrl:${JSON.stringify(origin)},accessToken:'fixture-secret'})});`,
      );
      const env = {
        ...process.env,
        NODE_EXTRA_CA_CERTS: join(folder, 'cert.pem'),
        ACE_RUNTIME_ORIGIN: origin,
        ACE_RUNTIME_TOKEN: 'fixture-secret',
        SF_AUTOUPDATE_DISABLE: 'true',
      };
      const cli = async (args) => {
        let result;
        try {
          result = await exec(
            process.env.ACE_TEST_SF_HOST || process.execPath,
            [
              ...(process.env.ACE_TEST_SF_HOST ? [] : ['--import', preload, join(root, 'bin/run.js')]),
              ...args,
              '--api-version',
              '68.0',
              '--json',
            ],
            {
              env: { ...env, ...(process.env.ACE_TEST_SF_HOST ? { NODE_OPTIONS: `--import=${preload}` } : {}) },
              timeout: 15000,
            },
          );
        } catch (error) {
          result = error;
        }
        assert(!`${result.stdout}${result.stderr}`.includes('fixture-secret'), 'credential leaked');
        return JSON.parse(result.stdout);
      };
      const invoke = async (command, flags = [], body) => {
        const args = ['ace', ...command.split(' '), ...flags];
        if (command.startsWith('agent')) args.push('--target-org', 'fixture');
        if (body) {
          const file = join(folder, 'body.json');
          await writeFile(file, JSON.stringify(body));
          args.push('--body-file', file);
        }
        if (body || / (close|delete)$/.test(command)) {
          const before = state.requests;
          const plan = await cli([...args, '--dry-run']);
          assert.equal(plan.status, 0, JSON.stringify(plan));
          assert.equal((await cli(args)).name, 'WritesDisabled');
          assert.equal(
            (await cli([...args, '--allow-write', '--no-prompt', '--confirm', 'wrong'])).name,
            'ConfirmationRequired',
          );
          assert.equal(state.requests, before, 'unapproved write reached network');
          args.push('--allow-write', '--no-prompt', '--confirm', plan.result.plan.fingerprint);
        }
        const result = await cli(args);
        assert.equal(result.status, 0, JSON.stringify(result));
        return result.result;
      };
      const agent = ['--agent-id', 'a'];
      const conv = [...agent, '--conversation-id', 'c'];
      const owner = ['--owner-id', 'owner', '--owner-type', 'employee'];
      const session = [...conv, '--session-id', 's'];
      const memory = [...agent, '--profile-id', 'owner', '--profile-type', 'employee', '--category', 'fixture'];
      await invoke('agent create', [], { name: 'a', label: 'Fixture', dataspaceName: 'default', configuration: {} });
      assert.equal((await invoke('agent list')).data.totalSize, 1);
      assert.equal((await invoke('agent get', agent)).data.status, 'Active');
      await invoke('conversation create', agent, {
        conversationId: 'c',
        conversationOwnerId: 'owner',
        ownerType: 'employee',
      });
      const page = await invoke('conversation list', [
        ...agent,
        ...owner,
        '--status',
        'open',
        '--fields',
        'id',
        '--fields',
        'name',
      ]);
      assert.equal(page.data.conversations[0].conversationId, 'c');
      const nextArgs = Object.entries(page.continuation.flags).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value]).flatMap((v) => [`--${key}`, String(v)]),
      );
      const next = await cli([
        ...page.continuation.command.split(' '),
        ...nextArgs.filter((_, i, a) => a[i - 1] !== '--api-version' && a[i] !== '--api-version'),
      ]);
      assert.equal(next.status, 0, JSON.stringify(next));
      assert.equal(next.result.data.conversations.length, 0);
      await invoke('session create', conv, {
        sessionId: 's',
        conversationOwnerId: 'owner',
        ownerType: 'employee',
        participants: [{ id: 'owner', type: 'employee', role: 'owner' }],
      });
      await invoke('participant add', session, { participants: [{ id: 'a', type: 'agent', role: 'participant' }] });
      assert.equal((await invoke('session list', [...conv, ...owner])).data.sessions[0].participants.length, 2);
      assert.equal(
        (
          await invoke('entry add', conv, {
            sessionId: 's',
            entries: [{ participantId: 'owner', content: 'synthetic message' }],
          })
        ).state,
        'accepted',
      );
      assert.equal(
        (await invoke('conversation get', [...conv, ...owner])).data.entries[0].content,
        'synthetic message',
      );
      await invoke('memory create', memory, { memories: [{ content: 'before' }] });
      assert.equal((await invoke('memory read', memory)).data.memories[0].content, 'before');
      const updated = await invoke('memory update', memory, { memories: [{ memoryId: 'm0', content: 'after' }] });
      assert.equal(updated.data.memories[0].memoryId, 'replacement');
      assert.equal((await invoke('context get', conv)).data.context.memories[0].content, 'after');
      await invoke('memory delete', memory, { memories: [{ memoryId: 'replacement' }] });
      assert.equal((await invoke('memory read', memory)).data.memories.length, 0);
      assert.equal((await invoke('session close', session)).state, 'accepted');
      assert.equal((await invoke('session list', [...conv, ...owner])).data.sessions[0].status, 'closed');
      await invoke('conversation close', conv);
      assert.equal((await invoke('conversation get', [...conv, ...owner])).data.status, 'closed');
      const fail = ['ace', 'conversation', 'close', ...agent, '--conversation-id', 'fail'];
      const planned = await cli([...fail, '--dry-run']);
      const failed = await cli([...fail, '--allow-write', '--no-prompt', '--confirm', planned.result.plan.fingerprint]);
      assert.notEqual(failed.status, 0);
      assert.equal(state.failures, 1, 'uncertain write retried');
      await invoke('agent delete', agent);
      assert.equal((await invoke('agent list')).data.totalSize, 0);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await rm(folder, { recursive: true, force: true });
    }
  },
);
