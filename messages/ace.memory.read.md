# summary
Read memories in an explicitly selected profile category.

# description
GET /api/v1/agentic/memory

Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --profile-id EXAMPLE_ID --profile-type individual --category EXAMPLE_ID --json
