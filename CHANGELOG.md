# Changelog

## 0.1.0-beta.4 — 2026-10-13

- Test setup orchestration for first-run provisioning, alias preservation, repeat-run reuse, and uncertain deployment without touching a live org.
- Add `sf ace setup` for explicit, browser-free JWT ECA provisioning, permission-set preauthorization, secure local key storage, repeat-run checks and an ACE runtime verification read. Existing sf aliases for the user are kept.
- Fix runtime commands failing with an unexplained `RuntimeAuthFailed: ... HTTP 400` when the org grant lacks `cdp_query_api`: they now fail with `RuntimeScopeMissing` and point to `sf ace setup`. Other exchange failures include Salesforce's OAuth `error: error_description`.
- Include Salesforce's structured `errorCode: message` in HTTP errors (token redacted, capped at 300 characters; raw bodies are still never shown). Salesforce internal errors now exit with sf's standard gack code 20 instead of 1.
- Accept `configuration.isMemoryGenerationEnabled` in `ace agent create` bodies; registrations report it, and the stricter schema blocked creating memory-generating agents.
- Show `title: detail` from Data 360 runtime problem-details errors, and warn after `ace agent create` that runtime commands can fail for several minutes after an agent reports Active.
- Give each `sf ace` topic its own description instead of borrowing one command's summary.
- Return agent-list pagination continuations using actual page boundaries, preserving filters and authentication context without assuming `totalSize` is a global count.
- Follow bounded pagination in the existing-resource verifier; fail on repeated cursors and missing results.
- Require explicit command/assertion coverage and memory-creation read-back in the lifecycle verifier.
- Give command classes descriptive names for actionable error contexts, clarify API-name/category placeholders, and avoid implying that session closure guarantees memory extraction.
- Add regression tests for offset continuation, org-token exchange, incomplete credential pairs, and paginated verification.
- Document reproducible runtime readiness, closed-session indexing, explicit ordering, and participant read-back limitations.
- Keep command summaries only in message bundles; `ace schema` reads them from there and now reports each operation's result caveat as text.
- Declare per-operation result caveats in the operation catalog instead of matching command names in the transport, and share one default API version constant.
- Generate `docs/COMMANDS.md` with `npm run docs` and fail `npm run check` when it is stale. The regenerated reference adds `sf ace schema` and the `--source` flag for `ace session list`.
- Replace the prepack wrapper script with `npm run build`.

## 0.1.0-beta.3 — 2026-10-10

Preserve request timeouts in pagination continuations and identify beta commands through oclif. Externalize transport errors and warnings through Salesforce message bundles. Remove the unused generator that overwrote maintained help. Build the unchanged command manifest through the existing oclif core API, removing 210 development packages and the vulnerable braces dependency chain. Audit development dependencies in the release gate. Tighten live verification to require exact record matches, nonempty assembled context, and complete, well-formed deletion readbacks. Increase live verification's bounded output buffer for conversation graphs. The native closed-session index and new-registration runtime readiness remain provider limitations.

## 0.1.0-beta.2 — 2026-10-10

Fix context routing by supplying the runtime-required agent header. Add explicit conversation-source session listing for closed sessions omitted by the native index. Preserve live verification attempts and add read-only regression checks. Document real business-conversation and assembled-context proof, native index limitations, and remaining extraction/identity gaps.

## 0.1.0-beta.1 — 2026-10-09

Initial independent Salesforce CLI plugin: 18 published ACE API operations and offline schema discovery. Includes typed validation, org authentication, Data 360 token exchange, explicit write approval, structured JSON, and terminal-ready documentation. Live acceptance limitations are documented in docs/LIVE-VERIFICATION.md.
