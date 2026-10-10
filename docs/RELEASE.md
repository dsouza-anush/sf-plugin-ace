# Release process

Package: `@anushdsouza/sf-plugin-ace`. Source: `dsouza-anush/sf-plugin-ace`. Independent community beta; no Salesforce signing or certification claim.

1. Update the version, changelog, API coverage, and live-verification matrix. Record unsupported server features and failed live operations explicitly.
2. Run `npm ci` and `npm run release:check` on Node 22.19+ and Node 24. The gate includes TypeScript, Salesforce lint, formatting, unit and HTTPS workflow tests, all command help, clean packed installation, public-source scanning, and an audit of production and development dependencies.
3. Export only allowlisted source using `npm run release:export -- /new/empty/directory`. Keep org-specific records and raw responses in the private development workspace. Initialize a clean Git repository for the first publication; never publish inherited private history.
4. Verify the fresh exported source with the same release gate. Inspect `npm pack --json`, record the artifact SHA-256, and verify installation in a clean Salesforce CLI host.
5. Push the exact reviewed source to the release repository. Require successful CI, verify the matching `v<version>` tag with `npm run release:tag:check -- v<version>`, and create the GitHub Release with the tarball and checksum.
6. Publish the exact validated tarball with npm trusted publishing through the protected GitHub `npm` environment. Bootstrap package ownership and the trusted publisher in npm through the package owner's authenticated session. Credentialed registry configuration is not created by committing a workflow. If npm authentication or CI is blocked, report the GitHub artifact and npm status separately; never claim npm publication from a successful pack.
7. Verify registry version/integrity, install from the registry in a clean Salesforce CLI, and run `sf ace schema --json` and command help. Update the release record with observed results.

The beta channel is explicit: `sf plugins install @anushdsouza/sf-plugin-ace@beta`. Stable promotion requires review of the live-verification gaps; it is not automatic. For rollback, install the previous pinned package version. Do not silently replace an already published version. Uninstall with `sf plugins uninstall @anushdsouza/sf-plugin-ace`.

Live release acceptance uses an explicitly designated org and disposable resources. It must read back mutations and record server failures without retries or changed request semantics. A 202 response is acceptance only. Default development tests never modify a live org.

## Explicit live acceptance

With an existing authorized org and employee identity, set `ACE_LIVE_ORG`, `ACE_LIVE_OWNER`, `ACE_LIVE_API_VERSION`, `ACE_LIVE_REPORT` (a private path outside the repository), `ACE_LIVE_ALLOW_WRITES=yes`, and `ACE_LIVE_ALLOW_DELETE=yes`, then run `npm run live:verify`. Runtime credentials can use the documented environment pair if the configuration grant lacks runtime scope. This creates uniquely named disposable registrations, conversations, sessions, and memories; it deletes only its own memory and registration. Failures retain a receipt for reconciliation. Never rerun an uncertain mutation blindly.
