# Contributing

Use Node 22.19+ or Node 24. Run `npm ci`, `npm run release:check`, and `git diff --check`. Follow Salesforce SfCommand, externalized messages, flag, JSON-envelope, and ESLint conventions. Add a meaningful regression test for a behavioral change. Do not add inferred endpoints or credentials.

Keep live org responses and environment-specific receipts outside this repository. Never run destructive tests against existing user resources. Release publication is described in docs/RELEASE.md.
