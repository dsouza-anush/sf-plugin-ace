# Command reference

Generated from the implemented operation catalog. Run `sf ace schema --json` for structural body schemas and `sf ace COMMAND --help` for full flag help. Every command supports Salesforce JSON output.

## sf ace agent list

List ACE agent registrations.

`GET /services/data/v{version}/ssot/agentic/agents`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--limit` | query: `limit` | No |
| `--offset` | query: `offset` | No |
| `--filters` | query: `filters` | No |
| `--order-by` | query: `orderBy` | No |

## sf ace agent get

Get an ACE agent registration by ID or API name.

`GET /services/data/v{version}/ssot/agentic/agent/{agentId}`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | path: `agentId` | Yes |

## sf ace agent create

Register an ACE agent using a reviewed configuration file.

`POST /services/data/v{version}/ssot/agentic/agent`

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace agent create" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace agent delete

Irreversibly delete an ACE agent and its associated data.

`DELETE /services/data/v{version}/ssot/agentic/agent/{agentId}`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | path: `agentId` | Yes |

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace conversation list

List conversations for an authorized owner.

`GET /api/v1/agentic/conversations`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--owner-id` | query: `owner_id` | Yes |
| `--owner-type` | query: `owner_type` | Yes |
| `--status` | query: `status` | No |
| `--time-range` | query: `time_range` | No |
| `--fields` | query: `fields` | No |
| `--participant-id` | query: `participant_id` | No |
| `--page-token` | query: `page_token` | No |

## sf ace conversation get

Retrieve a conversation data graph.

`GET /api/v1/agentic/conversations/{conversationId}`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |
| `--owner-id` | query: `owner_id` | Yes |
| `--owner-type` | query: `owner_type` | No |
| `--session-id` | query: `session_id` | No |
| `--participant-id` | query: `participant_id` | No |
| `--scope` | query: `scope` | No |
| `--page-token` | query: `page_token` | No |

## sf ace conversation create

Create a conversation for an authorized owner.

`POST /api/v1/agentic/conversations`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace conversation create" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace conversation close

Submit a request to close a conversation.

`POST /api/v1/agentic/conversations/{conversationId}/close`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace session list

`--source index` (default) uses the native session index. `--source conversation` projects actual session summaries from the conversation graph, including closed sessions omitted by the verified index. It supports status and id/startTime/status fields, rejects participant/time-range filters, and preserves graph pagination.

List sessions in an authorized conversation.

`GET /api/v1/agentic/conversations/{conversationId}/sessions`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |
| `--owner-id` | query: `owner_id` | Yes |
| `--owner-type` | query: `owner_type` | Yes |
| `--status` | query: `status` | No |
| `--time-range` | query: `time_range` | No |
| `--fields` | query: `fields` | No |
| `--participant-id` | query: `participant_id` | No |
| `--page-token` | query: `page_token` | No |

## sf ace session create

Create a conversation session with participants.

`POST /api/v1/agentic/conversations/{conversationId}/sessions`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace session create" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace session close

Submit session closure and trigger memory extraction.

`POST /api/v1/agentic/conversations/{conversationId}/sessions/{sessionId}/close`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |
| `--session-id` | path: `sessionId` | Yes |

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace participant add

Add participants to a conversation session.

`POST /api/v1/agentic/conversations/{conversationId}/sessions/{sessionId}/participants`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |
| `--session-id` | path: `sessionId` | Yes |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace participant add" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace entry add

Add messages, traces, or entries to a conversation.

`POST /api/v1/agentic/conversations/{conversationId}/entries`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | header: `agent_id` | Yes |
| `--conversation-id` | path: `conversationId` | Yes |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace entry add" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace memory read

Read memories in an explicitly selected profile category.

`GET /api/v1/agentic/memory`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--profile-id` | query: `profile_id` | Yes |
| `--profile-type` | query: `profile_type` | Yes |
| `--category` | query: `category` | Yes |
| `--agent-id` | header: `agent_id` | No |

## sf ace memory create

Create memories for an authorized profile.

`POST /api/v1/agentic/memory`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--profile-id` | query: `profile_id` | Yes |
| `--profile-type` | query: `profile_type` | Yes |
| `--category` | query: `category` | Yes |
| `--agent-id` | header: `agent_id` | No |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace memory create" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace memory update

Replace memories and return their new identifiers.

`POST /api/v1/agentic/memory`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--profile-id` | query: `profile_id` | Yes |
| `--profile-type` | query: `profile_type` | Yes |
| `--category` | query: `category` | Yes |
| `--agent-id` | header: `agent_id` | No |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace memory update" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace memory delete

Delete explicitly selected memories.

`DELETE /api/v1/agentic/memory`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--profile-id` | query: `profile_id` | Yes |
| `--profile-type` | query: `profile_type` | Yes |
| `--category` | query: `category` | Yes |
| `--agent-id` | header: `agent_id` | No |

Requires `--body-file` containing the published JSON body. Inspect it with `sf ace schema --command "ace memory delete" --json`.

Requires `--allow-write` and interactive confirmation, or `--no-prompt --confirm FINGERPRINT` after dry-run review.

## sf ace context get

Retrieve assembled ACE context in fast mode.

`GET /api/v1/agentic/context`

| Flag | Wire location/name | Required |
| --- | --- | --- |
| `--agent-id` | query: `agent_id` | Yes |
| `--conversation-id` | query: `conversation_id` | Yes |
| `--owner-id` | query: `owner_id` | No |
| `--owner-type` | query: `owner_type` | No |
| `--mode` | query: `mode` | No |
| `--latency-sensitivity` | query: `latency_sensitivity` | No |
| `--token-budget` | query: `token_budget` | No |
