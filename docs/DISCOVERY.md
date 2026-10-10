# Existing CLI discovery — 2026-10-09

Conclusion: no dedicated ACE Salesforce CLI plugin was found in the public sources and installed command surfaces checked. This is a bounded negative search, not proof that no unpublished or internal project exists.

| Check | Observed result |
| --- | --- |
| Installed Salesforce CLI 2.144.6, core and linked plugin inventory | No dedicated ACE/Agentic Memory & Context command namespace. |
| All 77 public repositories in the salesforcecli GitHub organization | No repository identified as an ACE or Agentic Memory & Context plugin. |
| Current salesforcecli/plugin-agent main source tree (52 command-related paths) and public README | Agent authoring, testing, preview, ADL, MCP, and other agent commands; no ACE runtime/agentic memory/context command family. npm latest observed: 2.2.2. |
| npm `@salesforce/plugin-ace` | Registry returned 404. Name absence alone does not exclude differently named plugins. |
| npm search `salesforce ace` | No relevant dedicated plugin among returned results. |
| GitHub repository searches `ace org:salesforcecli` and `agentic memory salesforce` | No matching repositories returned. |
| Public web searches for Agent Context Engine CLI, Agentic Memory CLI, sf-plugin-ace, and sf ace | No dedicated published plugin found. |

The general `sf api request rest` capability is prior art for authenticated platform REST requests; it is not an ACE-specific workflow, validation, runtime-token, or coverage surface. This implementation does not replace `sf agent` authoring commands.

Primary sources:

- [Salesforce CLI repositories](https://github.com/orgs/salesforcecli/repositories)
- [plugin-agent source and command reference](https://github.com/salesforcecli/plugin-agent)
- [plugin-api](https://github.com/salesforcecli/plugin-api)
- [Salesforce CLI architecture](https://github.com/salesforcecli/cli/blob/main/ARCHITECTURE.md)
- [sf-plugins-core](https://github.com/salesforcecli/sf-plugins-core)
- [Salesforce CLI ESLint rules](https://github.com/salesforcecli/eslint-plugin-sf-plugin)
- [Published ACE runtime reference](https://developer.salesforce.com/docs/data/agentic-memory-context/references/agentic-memory-context-api-ref/agentic-memory-context-ref-home.html)

No internal strategy or roadmap sources were consulted or copied into this repository. Recheck this discovery before proposing upstream ownership or releasing a public package.
