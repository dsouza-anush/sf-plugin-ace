# Security

Do not include org records, access tokens, private keys, credentials, or raw runtime responses in public issues. Report a vulnerability privately using GitHub private vulnerability reporting when enabled. If unavailable, contact the repository owner privately before sharing exploit or credential details.

The CLI uses HTTPS, rejects redirects, validates runtime origins, keeps exchanged tokens in memory, and requires exact-request approval for writes. JSON output may contain sensitive org data. Handle it under your organization’s policy.
