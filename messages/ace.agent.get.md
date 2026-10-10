# summary
Get an ACE agent registration by ID or API name.

# description
GET /services/data/v{version}/ssot/agentic/agent/{agentId}

Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --json
