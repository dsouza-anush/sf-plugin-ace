# summary
List sessions in an authorized conversation.

# description
GET /api/v1/agentic/conversations/{conversationId}/sessions

Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --conversation-id EXAMPLE_ID --owner-id EXAMPLE_ID --owner-type individual --json
