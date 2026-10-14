# summary
List conversations for an authorized owner.

# description
GET /api/v1/agentic/conversations

Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id AGENT_API_NAME --owner-id EXAMPLE_ID --owner-type individual --json
