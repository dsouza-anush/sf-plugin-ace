# summary
Submit session closure and trigger memory extraction.

# description
POST /api/v1/agentic/conversations/{conversationId}/sessions/{sessionId}/close

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --conversation-id EXAMPLE_ID --session-id EXAMPLE_ID --dry-run --json
