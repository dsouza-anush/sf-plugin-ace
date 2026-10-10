# errors.origin
Use a verified HTTPS origin without a path, credentials, query, or fragment.

# errors.api-version
Agent Configuration requires API version 66.0 or later.

# errors.dot-segment
Path identifiers cannot be dot segments.

# errors.owner-type
Provide --owner-type with --owner-id.

# errors.unexpected-body
This operation does not accept a body.

# errors.projection-field
Conversation source supports only id, startTime, and status fields.

# errors.projection-array
Conversation response did not contain a session array; no session result was inferred.

# errors.projection-id
Conversation response contained an invalid session identifier.

# errors.writes-disabled
Writes are disabled. Review --dry-run, then explicitly pass --allow-write.

# errors.confirmation
Write not confirmed. For automation, pass --no-prompt --confirm with the fingerprint from --dry-run.

# errors.exchange
Runtime token exchange failed. Check the authorized Salesforce connection.

# errors.runtime-session
Salesforce did not return a usable runtime token and tenant origin.

# errors.read-failed
Read failed or timed out. Check authentication and connectivity.

# errors.write-unknown
Write outcome is unknown. Read the affected state before retrying; no automatic retry was made.

# errors.read-http
Check permissions, identity, and inputs.

# errors.write-http
Read the affected state before retrying.

# errors.response
ACE returned an unreadable response. For writes, verify current state before retrying.

# warnings.projection
Session summaries are projected from the conversation API, not the session index. Missing fields remain absent. Pagination follows the conversation API.

# warnings.accepted
Accepted by Salesforce; asynchronous completion and memory extraction are not verified.

# warnings.registration
Registration response received; use ace agent get to verify Active status. Additional graph readiness is separate.

# warnings.fast-mode
Fast mode does not apply token_budget or latency_sensitivity.

# warnings.memory-update
Updated memories may have new identifiers; use the returned identifiers.

# errors.required
Provide --%s.

# errors.parameter
Invalid --%s.

# errors.single
Provide one --%s.

# errors.integer
Invalid --%s integer.

# errors.projection-filter
--%s is not supported with --source conversation. Use --source index.

# errors.exchange-http
Runtime token exchange returned HTTP %s. Check OAuth scopes and tenant provisioning.

# errors.body
Invalid request body: %s. See command help and the API reference.

# errors.http
ACE returned HTTP %s. %s
