# summary
Submit a request to close a conversation.

# description
POST /api/v1/agentic/conversations/{conversationId}/close

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id AGENT_API_NAME --conversation-id EXAMPLE_ID --dry-run --json
