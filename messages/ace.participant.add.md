# summary
Add participants to a conversation session.

# description
POST /api/v1/agentic/conversations/{conversationId}/sessions/{sessionId}/participants

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

Supply the published JSON body using --body-file. Identifiers in flags are placed in their published header, query, or path locations.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --conversation-id EXAMPLE_ID --session-id EXAMPLE_ID --body-file request.json --dry-run --json
