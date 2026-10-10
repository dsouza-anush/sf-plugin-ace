# Changelog

## 0.1.0-beta.3 — 2026-10-10

Preserve request timeouts in pagination continuations and identify beta commands through oclif. Externalize transport errors and warnings through Salesforce message bundles. Remove the unused generator that overwrote maintained help. Build the unchanged command manifest through the existing oclif core API, removing 210 development packages and the vulnerable braces dependency chain. Audit development dependencies in the release gate. Tighten live verification to require exact record matches, nonempty assembled context, and complete, well-formed deletion readbacks. Increase live verification's bounded output buffer for conversation graphs. The native closed-session index and new-registration runtime readiness remain provider limitations.

## 0.1.0-beta.2 — 2026-10-10

Fix context routing by supplying the runtime-required agent header. Add explicit conversation-source session listing for closed sessions omitted by the native index. Preserve live verification attempts and add read-only regression checks. Document real business-conversation and assembled-context proof, native index limitations, and remaining extraction/identity gaps.

## 0.1.0-beta.1 — 2026-10-09

Initial independent Salesforce CLI plugin: 18 published ACE API operations and offline schema discovery. Includes typed validation, org authentication, Data 360 token exchange, explicit write approval, structured JSON, and terminal-ready documentation. Live acceptance limitations are documented in docs/LIVE-VERIFICATION.md.
