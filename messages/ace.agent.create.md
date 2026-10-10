# summary
Register an ACE agent using a reviewed configuration file.

# description
POST /services/data/v{version}/ssot/agentic/agent

Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.

Supply the published JSON body using --body-file. Identifiers in flags are placed in their published header, query, or path locations.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org --body-file request.json --dry-run --json
