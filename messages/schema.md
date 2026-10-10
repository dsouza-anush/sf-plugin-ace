# summary
Describe ACE commands, parameters, and JSON request schemas without authentication.
# description
Lists the implemented published operations. JSON schemas describe structural input validation; command validation also enforces conditional requirements such as Message content and data-space spelling exclusivity.
# examples
- <%= config.bin %> <%= command.id %> --json
- <%= config.bin %> <%= command.id %> --command "ace session create" --json
# flags.command
Space-separated ACE command name to describe.
# note
Independent community plugin. Operation presence is not live tenant verification. Body schemas are structural; conditional validation still applies when commands execute.
