# summary
List sessions in an authorized conversation.

# description
GET /api/v1/agentic/conversations/{conversationId}/sessions

Use --source conversation to project session summaries from the governed conversation API when the session index omits closed sessions. The result identifies its source. This mode supports status and id/startTime/status field projection; time-range and participant-id filters are rejected. Missing fields remain absent.

Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --conversation-id EXAMPLE_ID --owner-id EXAMPLE_ID --owner-type individual --json

- <%= config.bin %> <%= command.id %> --target-org my-org --agent-id EXAMPLE_ID --conversation-id EXAMPLE_ID --owner-id EXAMPLE_ID --owner-type employee --source conversation --status CLOSED --json
