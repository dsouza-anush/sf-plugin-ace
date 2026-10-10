# ACE CLI coverage and headless gaps

Scope: 4 published Agent Configuration operations plus 14 Agentic Memory & Context runtime operations. All 18 have dedicated executable commands. This is operation/request coverage, not a claim that every response schema or tenant workflow is verified. The CLI preserves upstream JSON rather than normalizing away unknown fields or warnings.

## Operation map

| Command | Method | Path relative to its API surface |
| --- | --- | --- |
| `sf ace agent list` | GET | `/agents` |
| `sf ace agent get` | GET | `/agent/{agentIdOrApiName}` |
| `sf ace agent create` | POST | `/agent` |
| `sf ace agent delete` | DELETE | `/agent/{agentIdOrApiName}` |
| `sf ace conversation create` | POST | `/conversations` |
| `sf ace conversation list` | GET | `/conversations` |
| `sf ace conversation get` | GET | `/conversations/{conversationId}` |
| `sf ace conversation close` | POST | `/conversations/{conversationId}/close` |
| `sf ace session create` | POST | `/conversations/{conversationId}/sessions` |
| `sf ace session list` | GET | `/conversations/{conversationId}/sessions` |
| `sf ace session close` | POST | `/conversations/{conversationId}/sessions/{sessionId}/close` |
| `sf ace participant add` | POST | `/conversations/{conversationId}/sessions/{sessionId}/participants` |
| `sf ace entry add` | POST | `/conversations/{conversationId}/entries` |
| `sf ace memory read` | GET | `/memory` |
| `sf ace memory create` | POST | `/memory` |
| `sf ace memory update` | POST | `/memory` |
| `sf ace memory delete` | DELETE | `/memory` |
| `sf ace context get` | GET | `/context` |

Configuration base: `/services/data/v{version}/ssot/agentic`, Salesforce OAuth, API 66.0+. Runtime base: `/api/v1/agentic`, authorized runtime bearer identity. `sf ace schema` is a local helper, not an upstream operation.

Request support includes registration name/label/description/data space/profile DMOs/additional graphs; conversation owners/channel/variables; session participants/timestamps/nullable endTime/orgId/variables; free-form participant type; Message/Trace/Entry records, attachments, interaction IDs and structured trace variables; memory content/IDs/category; all published runtime query filters; repeated `fields`; page tokens; configuration ordering; and fast-mode context parameters.

## Contract discrepancies

- **Agent data-space spelling:** the published schema uses `dataSpaceName`, while its example and the existing acceptance notes use `dataspaceName`. The CLI accepts exactly one spelling and sends it unchanged. It never retries a rejected write using alternate spelling. The docs use `dataspaceName`; tenant acceptance is still deployment-specific.
- **Additional graphs:** the CLI does not copy the MCP app's local two-graph cap into the public API model. Server limits still apply. Profile DMO `associatedDataGraph` is not added from an inconsistent example when absent from the bounded input contract.
- **Memory agent header:** individual operation pages omit `agent_id`; group guidance permits it. `--agent-id` is optional for memory, required as a header for conversation operations, and a query parameter for context.
- **Connect schema freshness:** the prior contract audit found that the dynamic spec's linked YAML returned 404. This implementation uses the bounded v68 operation/input snapshot and indexed public reference; a fresh full machine-readable schema was not obtained. Complete response-schema parity is not claimed.
- **Offset:** `--offset 0` is accepted for the first page, matching the existing client. Some descriptive text says positive offset. Use an explicit tenant-supported offset when required.
- **Fast-mode knobs:** token budget and latency sensitivity are transmitted when requested, but Salesforce documents that they have no effect in fast mode.

## What cannot yet be completed solely through this plugin

| Workflow / gap | Why it is limited | Current headless option | Proposed way to fill the gap |
| --- | --- | --- | --- |
| Initial ACE/agentic setup and licensing | No standalone setup/provisioning endpoint in the verified ACE family | Administrator completes documented prerequisite setup | Salesforce should publish a supported setup/readiness API or metadata type, with permissions and lifecycle states; then add dedicated commands. |
| Retry failed agent provisioning | Native Agent Config exposes Retry, but no corresponding operation exists in the verified published API family | Use the supported native Retry action, then verify status and runtime readiness; this is not a CLI operation | Publish a retry/reconcile API with receipts and error details before adding `sf ace agent retry`. |
| In-place agent registration update | No published PATCH/PUT operation in this family | Read configuration and prepare a new registration if appropriate; deletion is not a safe update substitute | Add a documented update operation with concurrency control and preservation semantics. |
| Context Pack or context-requirements publication | Local design artifacts have no verified public resource contract | Author/export local drafts outside this plugin; explicitly distinguish them from registrations | Publish resource/schema/versioning/association APIs before implementing a live publication command. |
| External-customer identity bootstrap | OAuth exchange does not by itself establish every customer identity flow | Supply an independently provisioned, authorized runtime JWT/origin pair | Document and expose a supported issuance/exchange flow with identity claims, audience, scopes, expiration, and examples. Never infer an issuer. |
| Data space, profile DMO, and graph creation/build | These are adjacent Data 360 APIs, outside the 18 ACE operations | Use supported Data 360 CLI/API tooling, then reference verified names in registration JSON | Maintain a separate Data 360 integration guide and explicit readiness checks; avoid duplicate or guessed endpoints. |
| Extraction completion and ingestion-job tracking | 202 confirms acceptance; no job/status endpoint in the verified runtime family | Bounded caller-managed reads of conversation/session/memory state | Publish job IDs/status, extraction outcome/error details, and completion notifications; add polling commands only then. |
| Exactly-once retries | No verified idempotency-key contract | No automatic retries; reconcile affected state before any retry | Add documented idempotency keys and operation receipts. A local plan fingerprint is not idempotency. |
| Category discovery and time-range grammar | Category listing and filter grammar absent from verified pages | Operator supplies exact supported category/expression | Publish category/metadata discovery and a formal filter grammar with examples. |
| Context source completeness and hard token limits | Active registration does not ensure every graph is ready; fast-mode budgeting controls are ineffective | Preserve upstream warnings and context provenance; apply explicitly local downstream limits if needed | Add source-level availability, completeness, and supported server-side budget contracts. |
| Historical browser-local drafts | They live in browser storage and have no server read API | Export them deliberately before any local processing | Add a versioned local import/export format; keep it separate from Salesforce writes. |
| Zero-touch authentication and security setup | Permissions, licensing, connected/external-client apps, and identity governance must already be authorized | Supported `sf org login` automation plus independently approved secrets and org policy | Document administrator-owned bootstrap separately; ordinary CLI checks must not change security settings. |
| One-command orchestration and auto-pagination | Plugin currently exposes atomic operations and explicit continuation | Shell/CI orchestration using JSON, bounded loops, and read-back | Add resumable workflow helpers only with durable receipts, explicit identity/filters, bounds, and safe reconciliation. |

## Evidence boundaries

- Implemented locally: 18 API commands, offline schema discovery, org authentication integration, runtime exchange or explicit token/origin, validation, request plans, confirmation, and structured outputs.
- Verified by synthetic tests: method/path/query/header/body mapping, validation, error redaction, no automatic retries, 202 status, pagination, command-process behavior, and package execution.
- Not claimed by these checks: live acceptance of every API, live customer identity access, extraction completion, org provisioning, npm publication, Salesforce signing/certification, or deployment of the docs app.

Sources: [Connect Agent Configuration](https://developer.salesforce.com/docs/data/connectapi/references/spec#tag/Agent-Configuration), [runtime operations](https://developer.salesforce.com/docs/data/agentic-memory-context/references/agentic-memory-context-api-ref/agentic-memory-context-ref-home.html), [Data 360 token exchange](https://developer.salesforce.com/docs/data/data-cloud-dev/guide/dc-quick-start.html), [registration lifecycle](https://developer.salesforce.com/docs/data/agentic-memory-context/guide/agentic-memory-agent-registration.html), [governance](https://developer.salesforce.com/docs/data/agentic-memory-context/guide/agentic-memory-governance.html), and the separately captured public runtime field tables in the ACE docs app.
