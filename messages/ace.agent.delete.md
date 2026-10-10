# summary
Irreversibly delete an ACE agent and its associated data.

# description
DELETE /services/data/v{version}/ssot/agentic/agent/{agentId}

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --dry-run --json
