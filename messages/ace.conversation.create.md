# summary
Create a conversation for an authorized owner.

# description
POST /api/v1/agentic/conversations

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

Supply the published JSON body using --body-file. Identifiers in flags are placed in their published header, query, or path locations.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id AGENT_API_NAME --body-file request.json --dry-run --json
