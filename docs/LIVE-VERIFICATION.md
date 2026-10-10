# Live verification and beta limitations

Verified 2026-10-09 Pacific / 2026-10-10 UTC against an explicitly authorized Salesforce test org, API 67.0, using the installed Salesforce CLI. All 18 API commands were actually sent; the schema command is intentionally offline. This beta is **not fully verified end to end**.

| Command | Observed live result |
| --- | --- |
| `ace agent list` | 200; creation and deletion reconciled against returned registrations. |
| `ace agent get` | 200; dedicated registration read back ACTIVE. |
| `ace agent create` | 201 using the authorized configuration grant. |
| `ace agent delete` | 204; absence verified afterward. |
| `ace conversation list` | Both 200 and intermittent 400 for identical scope. |
| `ace conversation get` | 200 after bounded read retries; message and CLOSED states verified. |
| `ace conversation create` | 201. |
| `ace conversation close` | 202 followed by CLOSED readback. |
| `ace session list` | 400 in the latest lifecycle; an earlier run returned 200 with an empty index despite a session in the conversation graph. |
| `ace session create` | 201; session subsequently observed in the conversation graph. |
| `ace session close` | 202 followed by CLOSED readback. |
| `ace participant add` | 202; membership completion is not independently verified. |
| `ace entry add` | 202; submitted message retrieved afterward. Earlier run also verified a trace. |
| `ace memory read` | 200. |
| `ace memory create` | 200; content verified. |
| `ace memory update` | 200; replacement content and identifier verified. |
| `ace memory delete` | 200; absence verified afterward. |
| `ace context get` | 403, including explicit owner scope and fast mode. |
| `ace schema` | Local pass; 18 operation schemas. No org request by design. |

## Unresolved server acceptance

Context retrieval has not succeeded. Session enumeration is not reliable in the verified org. Some identical reads alternate between 400 and 200; the root cause is unproven. Do not auto-retry a mutation to work around these results. The CLI transmits the published method/path/query/header contracts, preserves upstream outcomes, and does not substitute mock results or a different operation.

A separate existing registration remained in Error even after the native Agent Config Retry action; generated shared graphs were ready. Native retry is a UI-only gap in the verified published API family. No database status or security settings were forced.

Automatic memory extraction and external-customer identity access remain unverified. Manual memory curation and session closure do not prove extraction. Participant HTTP 202 establishes acceptance only. The most recent disposable acceptance registration and memory were deleted and their removal verified.

Configuration and runtime grants can differ in capability. A grant that authenticates can still fail registration creation or runtime token exchange. Use supported, already approved grants and verify each surface; the plugin does not alter org security.

## Release gates

Local gates passed on Node 22.23.1 and Node 24.15.0: strict TypeScript, Salesforce lint/format, 29 unit/contract/process/HTTPS workflow tests, all 19 help routes, clean packed installation, public-source boundary, and a production dependency audit with no reported vulnerabilities. Fresh exported source passed the same gates. Remote CI and registry publication are separate checks recorded on the release.

Private org identifiers, raw runtime responses, employee identities, and credentials are excluded from distribution. See [API coverage and proposed gap closures](API-COVERAGE.md) and [release procedure](RELEASE.md).
