# flags.dry-run
Validate and print the request plan and confirmation fingerprint without making network requests.
# flags.timeout
Request timeout in seconds; requests are never automatically retried.
# flags.runtime-origin
Verified runtime HTTPS origin, paired with ACE_RUNTIME_TOKEN; otherwise exchange the target org grant.
# flags.body-file
JSON request body file; use - to read standard input.
# flags.allow-write
Explicitly enable this mutation; confirmation is also required.
# flags.no-prompt
Run without a prompt; requires --confirm with this request's dry-run fingerprint.
# flags.confirm
SHA-256 fingerprint of the reviewed dry-run request.
# flags.agent-id
Registered ACE agent ID or API name.
# flags.agent-api-name
Registered ACE agent API name.
# flags.conversation-id
Conversation identifier.
# flags.session-id
Session identifier.
# flags.owner-id
Authorized conversation owner identifier; does not replace bearer identity.
# flags.owner-type
Conversation owner type.
# flags.profile-id
Authorized memory profile identifier.
# flags.profile-type
Memory profile type.
# flags.category
Exact tenant-supported memory category; no category is inferred.
# flags.limit
Maximum agents per page (1–200).
# flags.offset
Agent list offset (zero or greater).
# flags.filters
Agent Configuration filter expression.
# flags.order-by
Agent Configuration ordering direction.
# flags.status
Conversation or session status filter.
# flags.time-range
Tenant-supported time range expression; its grammar is not published.
# flags.fields
Projection field; repeat the flag for multiple fields.
# flags.participant-id
Participant filter.
# flags.page-token
Continuation token; preserve the original identity, filters, and scope.
# flags.scope
Conversation content scope.
# flags.mode
Context retrieval mode; only fast is supported.
# flags.latency-sensitivity
Published parameter that has no effect in fast mode.
# flags.token-budget
Published parameter that has no effect in fast mode.
# errors.body
Cannot read valid JSON from --body-file. Use a readable UTF-8 JSON file or - for standard input.
# errors.runtime-pair
Provide both --runtime-origin (or ACE_RUNTIME_ORIGIN) and ACE_RUNTIME_TOKEN, or remove both to exchange the target org grant.
# errors.org
Provide --target-org, configure a default org, or supply a runtime origin/token pair for runtime commands.
# errors.auth
Salesforce authentication could not be refreshed. Reauthorize the target org with Salesforce CLI.
# confirm
Execute %s against %s? Deletion is irreversible; asynchronous operations need read-back verification.

# flags.source
Session list source: native index, or summaries projected from the authorized conversation graph.
