# summary
Provision and verify headless ACE authentication with a JWT external client app.

# description
Use an existing administrator login to deploy a dedicated ECA, certificate, and preauthorization permission set. Assign the permission set to the named user, save an sf JWT login, exchange the token, and verify a read against an existing ACTIVE agent. No browser is opened. The user must already have the necessary Data 360 permissions.

Preview with --dry-run, then approve with --allow-write and either interactive confirmation or --no-prompt --confirm FINGERPRINT. Preview is local; it is not a Salesforce deployment validation. Existing apps must match the requested settings and local key pair; setup never rotates credentials or repairs incompatible apps automatically. The key directory is permanent: sf reads the private key on future token renewals. Re-running checks completed work and resumes without retrying an uncertain mutation automatically.

# examples
- Preview setup without changing local files or the org:
  <%= config.bin %> <%= command.id %> --target-org admin-org --username user@example.com --agent-id Existing_Agent --dry-run --json
- Provision after reviewing the preview fingerprint:
  <%= config.bin %> <%= command.id %> --target-org admin-org --username user@example.com --agent-id Existing_Agent --allow-write --no-prompt --confirm FINGERPRINT --json

# flags.username
Existing active Salesforce user to preauthorize and authenticate.
# flags.app-name
Dedicated ECA API name; existing settings must match exactly.
# flags.contact-email
ECA contact email; defaults to the username.
# flags.alias
Alias for the resulting JWT login.
# flags.key-dir
Permanent private directory containing server.key and server.crt; defaults to ~/.ace/ORG_ID/APP_NAME.
# flags.agent-id
Existing ACTIVE agent API name used for the runtime verification read.
# flags.dry-run
Print the local setup plan and approval fingerprint; make no network requests or writes.
# flags.allow-write
Explicitly enable ECA deployment, permission assignment and local credential storage.
# flags.no-prompt
Run without prompting; requires the reviewed plan fingerprint.
# flags.confirm
Exact fingerprint from the same setup arguments with --dry-run.
# confirm
Create or reuse %s and authorize %s in org %s for headless ACE, storing a permanent private key and replacing the sf login for this username?
# errors.approval
Preview with --dry-run, then supply --allow-write and approve interactively or use --no-prompt --confirm with the exact plan fingerprint.
# errors.user
The target username must resolve to exactly one active user in the administrator org.
# errors.agent
Choose an existing ACTIVE agent for the runtime readiness check.
# errors.partial
Setup found components without the matching app. Inspect the partial configuration before retrying; no existing components were overwritten.
# errors.deploy
Deployment has not reported Succeeded. Inspect the org deployment status before retrying setup.
# errors.permission
The preauthorization permission set is missing or grants unrelated access. Setup will not assign it.
# errors.identity
The JWT login did not resolve to the intended org and an access token.
# note
Existing sf aliases for this username are kept and now use this JWT login. Keep the private key available at the recorded path. Setup verifies an employee conversation read, not every runtime operation or external-customer identity flow.
