import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { operations } from '../lib/contracts.js';
const root = new URL('../', import.meta.url);
for (const op of operations) {
  const parts = op.command.split(' ');
  const bundle = parts.join('.');
  const folder = new URL(`src/commands/${parts.slice(0, -1).join('/')}/`, root);
  await mkdir(folder, { recursive: true });
  const flags = op.parameters.filter((p) => p.required).map((p) => `--${p.name} ${p.options?.[0] ?? 'EXAMPLE_ID'}`);
  if (op.body) flags.push('--body-file request.json');
  const example = `<%= config.bin %> <%= command.id %> --target-org my-org ${flags.join(' ')}${op.method !== 'GET' ? ' --dry-run' : ''} --json`;
  await writeFile(
    new URL(`${parts.at(-1)}.ts`, folder),
    `import { Messages } from '@salesforce/core';\nimport { AceCommand, flagsFor } from '../../../command.js';\n\nMessages.importMessagesDirectoryFromMetaUrl(import.meta.url);\nconst messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', '${bundle}');\n\nexport default class Command extends AceCommand {\n  public static readonly summary = messages.getMessage('summary');\n  public static readonly description = messages.getMessage('description');\n  public static readonly examples = messages.getMessages('examples');\n  public static readonly flags = flagsFor('${op.command}');\n\n  public async run() {\n    return this.runOperation('${op.command}');\n  }\n}\n`,
  );
  await writeFile(
    new URL(`messages/${bundle}.md`, root),
    `# summary\n${op.summary}\n\n# description\n${op.method} ${op.surface === 'configuration' ? '/services/data/v{version}/ssot/agentic' : '/api/v1/agentic'}${op.path}\n\n${op.method === 'GET' ? 'Returns the Salesforce response with HTTP status. Preserve pagination filters when following continuation.' : 'Writes default to disabled. Review --dry-run before enabling --allow-write. Interactive execution asks for confirmation; automation requires --no-prompt --confirm FINGERPRINT. Read affected state before retrying an uncertain outcome.'}\n${op.body ? '\nSupply the published JSON body using --body-file. Identifiers in flags are placed in their published header, query, or path locations.\n' : ''}\n# examples\n- ${example}\n`,
  );
}
console.log(`Generated ${operations.length} dedicated command classes and message bundles in ${fileURLToPath(root)}`);
