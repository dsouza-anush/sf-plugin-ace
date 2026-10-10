# Agent Context Engine for Salesforce CLI

An independent Salesforce CLI plugin (beta). It implements the 18 published Agent Configuration and Agentic Memory & Context operations as dedicated `sf ace` commands, plus offline schema discovery. It is not a Salesforce-published or signed plugin. See the release page for distribution status and the live-verification limitations.

## Install

Install from the npm beta channel:

```bash
sf plugins install @anushdsouza/sf-plugin-ace@beta
sf ace --help
```

For a GitHub Release tarball, use `sf plugins install "file:$PWD/anushdsouza-sf-plugin-ace-0.1.0-beta.3.tgz"`. To remove the installed plugin, use `sf plugins uninstall @anushdsouza/sf-plugin-ace`. Install a pinned version to roll back.

## Install from source

Use Node.js 22 (22.19+) or Node.js 24 and an installed Salesforce CLI.

```bash
cd sf-plugin-ace
npm ci
npm run check
npm run smoke
sf plugins link .
sf ace schema --json
sf ace agent list --target-org my-org --limit 25 --json
```

When running without linking, replace `sf` with `node bin/run.js`. For distribution within an approved environment, `npm pack` produces a self-contained plugin tarball. The package uses an explicit public-file allowlist. `sf plugins unlink @anushdsouza/sf-plugin-ace` removes the local link.

## Authentication

Configuration commands use Salesforce CLI org authentication through `@salesforce/core`. Authorize an org using the supported `sf org login` flow appropriate for your environment. `--target-org` accepts an existing username or alias; Salesforce's configured default org is supported. The plugin never asks for or stores a password.

Runtime commands either exchange that org's existing grant at the published `/services/a360/token` endpoint, or use the explicit pair `ACE_RUNTIME_ORIGIN` and `ACE_RUNTIME_TOKEN`. `--runtime-origin` overrides the origin environment variable. Supply tokens through an approved secret manager/environment, never as a command-line argument or committed file. Partial explicit configuration fails closed. The automatic exchange uses Salesforce's returned tenant origin, restricted to an HTTPS Salesforce domain, and keeps the token only in process memory.

A successful exchange is not proof of ACE permissions or end-user identity. Owner/profile flags select records; they do not impersonate a user or mint a JWT. External-customer identity provisioning still requires a separately supported identity flow. See [coverage and gaps](docs/API-COVERAGE.md).

## Read, inspect, and paginate

```bash
sf ace schema --command "ace session create" --json
sf ace conversation list --target-org my-org \
  --agent-id example_agent --owner-id OWNER_ID --owner-type employee \
  --fields id --fields name --json
sf ace context get --target-org my-org \
  --agent-id example_agent --conversation-id CONVERSATION_ID --json
```

Every command supports `--json` using Salesforce's normal `{status,result,warnings}` success envelope and nonzero error exits. `result` preserves `httpStatus`, `state`, upstream JSON in `data` (or explicitly identified session summaries with `--source conversation`), and wrapper warnings. Success means a response was received; it is not a workflow-completion claim. A 202 is explicitly `state: accepted`.

The three paginated conversation reads include `result.continuation` with the next command and the original filters, scope, target org, and cursor. Repeat that request while `nextPageToken` is nonempty. Each invocation reads one page; there is no unbounded auto-pagination. Agent lists expose the published `--limit`, `--offset`, `--filters`, and `--order-by` parameters. Memory pagination is not invented.

## Review and execute writes

Writes default to disabled. JSON files use the published body field names; identifiers belong in the corresponding flags. `--body-file -` supports stdin. `sf ace schema` exposes structural JSON schemas; execution also validates conditional requirements. Dry-run performs input validation without network requests and returns the exact method, route, query, body, target identity, and SHA-256 fingerprint. Treat plans as potentially sensitive application data.

```bash
sf ace memory create --target-org my-org \
  --profile-id PROFILE_ID --profile-type employee --category VERIFIED_CATEGORY \
  --body-file memories.json --dry-run --json
```

Example `memories.json`:

```json
{"memories":[{"content":"Prefers email for updates."}]}
```

Interactive writes require `--allow-write` and a terminal confirmation after displaying the plan. Automated writes require `--allow-write --no-prompt --confirm FINGERPRINT`, where the fingerprint is copied from the reviewed dry-run output. `--json` never opens a prompt. Changed payloads, parameters, or targets invalidate the fingerprint. The fingerprint is an exact-request confirmation mechanism, not an authorization credential or upstream idempotency key. Run plan approval and execution within your own access-controlled pipeline.

```bash
sf ace memory create --target-org my-org \
  --profile-id PROFILE_ID --profile-type employee --category VERIFIED_CATEGORY \
  --body-file memories.json --allow-write --no-prompt \
  --confirm REVIEWED_FINGERPRINT --json
```

There are no automatic write retries. After a timeout, unreadable response, or uncertain error, read the affected resource before deciding whether to retry. Agent deletion is irreversible and also removes associated data. Memory update can return replacement IDs; retain those IDs. Session closure can trigger extraction, but an accepted close does not prove extraction completion.

## End-to-end headless sequence

1. Have an administrator complete documented provisioning, data space, graph, permissions, and identity prerequisites. This plugin does not change org security.
2. Inspect `ace agent list/get`. Prepare the registration JSON using `ace schema`, dry-run `ace agent create`, approve the plan, and submit it.
3. Poll `ace agent get --agent-id NAME` until Salesforce reports `Active`; handle `Error` and impose a caller-controlled timeout. Then require a successful authorized runtime read: CP has reported ACTIVE before the runtime recognizes the agent API name. Additional graph availability must be checked separately.
4. Create a conversation and session using `ace conversation create` and `ace session create`, then add participants and messages/traces with `ace participant add` and `ace entry add`.
5. Use `ace context get`, conversation/session reads, and `ace memory read` under the authorized identity.
6. Close the session, independently read observable state, and inspect memories later. Do not assert extraction finished from the close response alone.
7. Curate memories with create/update/delete under explicit approval. Close conversations when appropriate. Delete registrations only when their cascading deletion is intended.

All write examples require the explicit review flow above. Schemas and operation mappings are in [the command reference](docs/COMMANDS.md); [coverage](docs/API-COVERAGE.md) records unsupported workflows and proposed ways to close each gap.

## Development conventions and verification

Commands are thin `SfCommand` subclasses with externalized command/flag messages, kebab-case flags, `Flags.requiredOrg`/`optionalOrg`, `Flags.orgApiVersion`, `SfError`, standard JSON envelopes, TypeScript strict mode, and the Salesforce CLI ESLint plugin's recommended rules. `contracts.ts` is the operation/input model, `client.ts` owns plan construction and transport, and `command.ts` owns CLI orchestration. There is no dependency on the MCP app or its demo mode. Existing MCP host confirmation is unchanged.

```bash
npm run check  # TypeScript, ESLint, unit/contract and actual command-process tests
npm run smoke  # all help routes, packed files, clean production install and execution
```

Contract tests use synthetic HTTP responses. The workflow test launches actual CLI processes against a stateful HTTPS fixture with an ephemeral trusted certificate, covering all 18 commands, approvals, readback, pagination, and uncertain-write handling. Only the org-authentication boundary is substituted; the CLI HTTP transport is real. The operation inventory is documented in the coverage matrix. Package smoke installs the actual tarball into a disposable directory and executes it. These checks do not establish live org acceptance, runtime identity access, or Salesforce certification. No destructive live tests are part of these checks.

The API version defaults to 68.0 when Salesforce's flag resolver supplies no version; override with `--api-version` (minimum 66.0). The request timeout defaults to 30 seconds, configurable from 1 to 300 seconds. HTTP redirects fail closed. Upstream error bodies and credential values are not included in plugin-generated errors. Successful runtime data is returned to stdout; handle/redact it before saving or sharing.


### End-to-end workflow test

```bash
node --test test/workflow.test.mjs
```

To test through an installed Salesforce CLI with this plugin linked:

```bash
ACE_TEST_SF_HOST="$(command -v sf)" node --test test/workflow.test.mjs
```

The fixture requires OpenSSL and removes its temporary certificate, payloads, and auth stub on completion. It makes no live Salesforce writes. See [live verification](docs/LIVE-VERIFICATION.md) for the acceptance limits.




See [live verification](docs/LIVE-VERIFICATION.md), [release process](docs/RELEASE.md), and [security reporting](SECURITY.md).
