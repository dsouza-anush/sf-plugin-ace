# Live verification and beta limitations

Verified 2026-10-09 Pacific / 2026-10-10 UTC against an explicitly authorized Salesforce test org, API 67.0, using the installed Salesforce CLI. All 18 API commands were actually sent; the schema command is intentionally offline. Every command has returned a successful result in real testing (18 remote operations plus offline schema). The complete fresh-registration acceptance gate is still **not passing reliably**. Native session-index behavior, registration propagation, and automatic extraction remain limitations.

| Command | Observed live result |
| --- | --- |
| `ace agent list` | 200; creation and deletion reconciled against returned registrations. |
| `ace agent get` | 200; dedicated registration read back ACTIVE. |
| `ace agent create` | 201 using the authorized configuration grant. |
| `ace agent delete` | 204; absence verified afterward. |
| `ace conversation list` | Both 200 and intermittent 400 for identical scope. |
| `ace conversation get` | 200 after bounded read retries; message and CLOSED states verified. |
| `ace conversation create` | 201. |
| `ace conversation close` | 202 followed by CLOSED readback. |
| `ace session list` | Explicit `--source conversation` returned the retained CLOSED session. The native index omits closed sessions in the verified org; transient 400 reads also occurred. |
| `ace session create` | 201; session subsequently observed in the conversation graph. |
| `ace session close` | 202 followed by CLOSED readback. |
| `ace participant add` | 202; a scoped Data 360 query independently verified persisted membership. |
| `ace entry add` | 202; submitted message retrieved afterward. Earlier run also verified a trace. |
| `ace memory read` | 200. |
| `ace memory create` | 200; content verified. |
| `ace memory update` | 200; replacement content and identifier verified. |
| `ace memory delete` | 200; absence verified afterward. |
| `ace context get` | 200 after adding the runtime-required `ctx-agent-id` header; nonempty Conversation and Profile context verified. |
| `ace schema` | Local pass; 18 operation schemas. No org request by design. |

## Follow-up diagnosis — 2026-10-10 UTC

The existing business-agent registration now reads ACTIVE. Its actual Agentforce answer about an existing order was ingested through `ace entry add`; `ace conversation get` retrieved the exact question and answer. Context retrieval subsequently returned nonempty Conversation and Profile entries. The registration changed before this follow-up; its recovery cause is not established.

- **Context request fixed:** controlled live requests returned 403 without `ctx-agent-id`, 200 with that header, and 403 again when removed. The CLI now sends the validated agent API name in this header as well as the published `agent_id` query parameter. No additional permissions or org security changes were required. This header is an observed runtime compatibility requirement absent from the inspected public operation page.
- **Participant completion verified:** a scoped Data 360 SQL read found the employee owner and added agent participant with their expected roles.
- **Session-index regression isolated:** three reads enumerated an ACTIVE session. After closure, three index reads omitted it while conversation reads returned that same session as CLOSED. An explicit CLOSED filter did not restore an older closed session. The persisted record had null owner and start fields. The native endpoint remains a provider gap.
- **Explicit working session source:** `ace session list --source conversation` retrieves the published, authorized conversation graph and projects actual session summaries. It preserves source provenance, pagination and missing fields; it does not invent timestamps or silently substitute results. This mode supports status and id/startTime/status field projection, but rejects participant and time-range filters. It fetches conversation history before discarding entries, so it can be more expensive than the index.
- **Transient reads:** identical authorized reads sometimes return 400 before succeeding. The lifecycle harness uses bounded read polling and preserves every attempt. No mutation is automatically retried.
- The real conversation and session were closed through the CLI and retained. No business-agent deletion, order mutation, security change, or forced status edit was used.

Run the read-only regression probe with existing authorized identifiers in `ACE_LIVE_ORG`, `ACE_LIVE_OWNER`, `ACE_LIVE_AGENT`, `ACE_LIVE_CONVERSATION`, and `ACE_LIVE_SESSION`, plus the documented runtime authentication:

```sh
ACE_LIVE_SESSION_SOURCE=conversation node scripts/verify-existing.mjs
```

The retained closed business conversation passed all four real CLI reads: conversation get, conversation list, session list with the explicit conversation source, and context get. Native index mode still fails the known-session assertion. The probe emits statuses and assertions, not credentials or raw runtime data.

## Remaining boundaries

Automatic memory extraction and external-customer identity access remain unverified. Manual memory curation and session closure do not prove extraction. Native Agent Config Retry has no equivalent operation in the verified published API family. Configuration and runtime grants can differ in capability; an authenticated grant can still fail creation or token exchange. The plugin does not alter org security.

Earlier beta.1 runs failed context with 403 and showed unreliable session enumeration. Those failures motivated these fixes and are not evidence that the native index was repaired. The full mutation harness records every attempt and checks persisted messages, memory replacement/deletion, open and closed session enumeration, conversation closure/listing, and disposable registration deletion.

## Latest full-lifecycle results

The first fixed run obtained successful results for all 19 commands and passed 8 of 9 readback assertions. Its immediate open-session read returned 400; closed-session enumeration with conversation source subsequently succeeded. The second fresh run stopped before conversation creation: configuration reported ACTIVE, but the runtime returned `unknown agent_id` for all 12 bounded readiness reads. A later read reproduced that response. The failed attempts remain in the evidence history. This is a runtime-registration propagation gap, not a successful end-to-end gate.

The existing business registration passes all four focused real regression reads, including assembled context and closed-session listing. This establishes the fixes against an operational registration without claiming that every new registration becomes runtime-ready. A supported readiness/reconcile API and a provider fix for lost closed-session fields are needed for reliable unattended bootstrap.

## Release gates

Local gates passed on Node 22.23.1 and Node 24.15.0: strict TypeScript, Salesforce lint/format, 32 unit/contract/process/HTTPS workflow tests, all 19 help routes, clean packed installation, public-source boundary, and a production dependency audit with no reported vulnerabilities. Fresh exported source passed the same gates. Remote CI and registry publication are separate checks recorded on the release.

Private org identifiers, raw runtime responses, employee identities, and credentials are excluded from distribution. See [API coverage and proposed gap closures](API-COVERAGE.md) and [release procedure](RELEASE.md).

## Quality-review candidate — beta.3, October 10

The beta.3 candidate preserves pagination timeouts, uses oclif beta markers and Salesforce message bundles for transport errors/warnings, and tightens verification assertions. Local validation now contains 33 tests. The unused help-overwriting scaffold generator was removed.

The candidate was installed from its tarball into a separate Salesforce CLI plugin directory on macOS (CLI 2.144.6). All four existing-business-conversation reads returned 200 with passing assertions: conversation get/list, session list with conversation source, and nonempty context assembly. This is an existing-registration regression, not a full fresh bootstrap.

The fresh-registration attempt created a disposable registration (201), then read it as ACTIVE (200). Runtime readiness did not pass: eleven bounded reads returned 400 and the final read returned 401. A subsequent token-exchange attempt followed by a read also returned 401. The run stopped before creating conversations, sessions, entries or memories; the registration was read before cleanup, deleted once (204), and absence verified against a complete registration listing. Failed readiness attempts remain in the private receipts. No existing business registration or org security setting was changed.

The full 19-command gate is still not passing. Prior successful operations remain historical evidence, not substitutes for this failed gate. Automatic extraction, external-customer identity, native closed-session indexing, and reliable runtime provisioning remain release limits. HTTP 401 also requires checking grant validity and runtime authorization; this audit does not establish that every 400/401 has one server-side cause.

## October 12 implementation review

The updated package was installed in an isolated Salesforce CLI environment and used against the authorized org. All 18 remote commands returned successful responses across an existing-registration runtime lifecycle and review-owned configuration lifecycle; offline schema passed separately. The packed runtime run passed ten read-back assertions using explicit conversation-source session listing, including newly added memory-create read-back.

The default native index still omitted a closed session. Fresh registration still returned `unknown agent_id` at runtime after configuration reported ACTIVE. The documented explicit ordering parameter returned HTTP 400 while the same list read without it succeeded. Participant addition was accepted (202), but independent persistence queries did not find the new membership during verification; completion is not claimed. Thus this is not an unconditional all-workflows acceptance gate.

Agent pagination was corrected and verified against seven real pages. The returned `totalSize` described the current page, so continuation uses actual page boundaries. Local checks now pass 36 tests on Node 22 and 24; package smoke, isolated Salesforce CLI installation, source-boundary checks, and the dependency audit also pass. Changes remain unreleased.

## Beta.4 release verification — October 13, 2026 Pacific

The candidate adds `sf ace setup`, runtime scope diagnostics, structured upstream errors, agent-list pagination fixes, and generated command documentation. Local Node 22.23.1 and Node 24.15.0 validation passes 44 tests, including the real-process HTTPS workflow for all 18 ACE operations and a new isolated setup workflow. The setup workflow exercises first-run provisioning, permission assignment, JWT login orchestration, preservation of existing aliases, repeat-run reuse without key replacement, and stopping without retry after an uncertain deployment. All 20 command help routes, clean package smoke, isolated Salesforce CLI install/schema/help/uninstall, the 83-file public-source scan, and a dependency audit with zero vulnerabilities passed. Salesforce metadata/authentication boundaries are synthetic in this setup test; it is not proof of a live fresh ECA deployment.

A current read-only probe against the available authorized org returned HTTP 200 for agent listing and found an ACTIVE registration. The subsequent Data 360 token exchange failed with `RuntimeScopeMissing`. Runtime reads could not proceed with that grant. The previously reported setup key directory was unavailable in this workspace. No live security configuration, permission assignment, or destructive acceptance operation was performed. Earlier successful runtime checks above remain dated historical evidence.

The plugin remains a community beta. Current evidence does not establish fresh live setup, automatic extraction, external-customer identity, repaired native closed-session indexing, or reliable propagation of new registrations.

## Beta.4 live headless verification — October 13, 2026 Pacific

The installed npm beta.4 package passed first-time JWT setup and a complete scoped conversation workflow against an explicitly authorized test org on Node 24.15.0. The prerequisites were an existing administrator Salesforce CLI login, a user with Data 360 permissions, and an existing ACTIVE ACE registration. No browser or UI interaction was used during setup, renewal, or runtime testing.

- **Fresh setup:** explicitly approved `sf ace setup` deployed a dedicated external client app and preauthorization permission set, assigned the named user, saved a persistent local JWT key pair, and verified a conversation read with HTTP 200. The result reported `ready`, `reused: false`, and `permissionAssigned: true`.
- **Reuse:** rerunning the same approved setup reported `ready`, `reused: true`, and `permissionAssigned: false`, followed by another HTTP 200 runtime read.
- **Credential renewal:** a standalone `sf org login jwt` succeeded. That upstream command removed aliases for the username even without `--alias`; the test restored those local aliases before proceeding. A separate normal `Org.refreshAuth()` test using saved JWT credentials preserved the aliases and was followed by an installed-CLI runtime read returning HTTP 200. The saved authentication had a JWT key and no refresh token. Private-key permissions were 0600. Explicit runtime origin/token environment variables were absent.
- **Conversation lifecycle:** agent get/list and conversation list succeeded; conversation and session creation returned 201; entry creation returned 202 and the exact message was subsequently read back. Session listing and context retrieval returned 200. A final context read contained the exact test marker and two user-context entries. Memory read returned 200. Session and conversation closure returned 202, then both were read back as CLOSED. Explicit conversation-source listing returned the closed session.

All five workflow assertions passed: message persistence, session enumeration, nonempty context, persisted closure, and closed-session enumeration. No mutation was automatically retried. The initial alias-related preflight failure occurred before any lifecycle mutation and is retained in the private evidence. The test conversation and session remain closed in the org; the approved client app, permission assignment, and local key pair remain for ongoing headless use.

This resolves the earlier missing-scope blocker for the newly configured JWT login. It does not establish zero-prerequisite tenant bootstrap, fresh agent-registration propagation, automatic memory extraction, external-customer identity, repaired native session indexing, participant persistence, or all 18 API operations in one live run. Memory mutation/deletion and agent deletion were not part of this verification. The context checks used an existing operational agent and employee identity.
