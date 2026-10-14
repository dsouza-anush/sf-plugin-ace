import { mkdir, mkdtemp, writeFile, rm, rename } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Messages, Org, SfError, StateAggregator } from '@salesforce/core';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import {
  setupPlan,
  setupMetadata,
  verifySetupMetadata,
  keyPair,
  sfJson,
  shellQuote,
  type MetadataRecord,
} from '../../setup.js';
import { AceTransport, planRequest } from '../../client.js';
import { DEFAULT_API_VERSION, operationFor } from '../../contracts.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'setup');
const literal = (value: string) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

export default class Setup extends SfCommand<Record<string, unknown>> {
  public static readonly state = 'beta';
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    username: Flags.string({ required: true, summary: messages.getMessage('flags.username') }),
    'app-name': Flags.string({ default: 'ACE_CLI', summary: messages.getMessage('flags.app-name') }),
    'contact-email': Flags.string({ summary: messages.getMessage('flags.contact-email') }),
    alias: Flags.string({ default: 'ace', summary: messages.getMessage('flags.alias') }),
    'key-dir': Flags.directory({ summary: messages.getMessage('flags.key-dir') }),
    'agent-id': Flags.string({ required: true, summary: messages.getMessage('flags.agent-id') }),
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run') }),
    'allow-write': Flags.boolean({ summary: messages.getMessage('flags.allow-write') }),
    'no-prompt': Flags.boolean({ summary: messages.getMessage('flags.no-prompt') }),
    confirm: Flags.string({ dependsOn: ['no-prompt'], summary: messages.getMessage('flags.confirm') }),
  };

  public async run(): Promise<Record<string, unknown>> {
    const { flags } = await this.parse(Setup);
    const org = flags['target-org'];
    const connection = org.getConnection();
    const plan = setupPlan({
      orgId: org.getOrgId(),
      admin: org.getUsername()!,
      instanceUrl: connection.instanceUrl,
      username: flags.username,
      appName: flags['app-name'],
      contactEmail: flags['contact-email'] ?? flags.username,
      alias: flags.alias,
      keyDirectory: flags['key-dir'] ?? join(homedir(), '.ace', org.getOrgId(), flags['app-name']),
      agentId: flags['agent-id'],
    });
    if (flags['dry-run']) return this.output({ state: 'planned', plan });
    if (!flags['allow-write']) throw new SfError(messages.getMessage('errors.approval'), 'SetupWriteNotEnabled');
    if (flags['no-prompt']) {
      if (flags.confirm !== plan.fingerprint)
        throw new SfError(messages.getMessage('errors.approval'), 'SetupConfirmationRequired');
    } else if (
      !(await this.confirm({ message: messages.getMessage('confirm', [plan.appName, plan.username, plan.orgId]) }))
    ) {
      throw new SfError(messages.getMessage('errors.approval'), 'SetupConfirmationRequired');
    }
    await connection.refreshAuth();
    const users = await connection.query<{ Id: string; IsActive: boolean }>(
      `SELECT Id, IsActive FROM User WHERE Username = '${literal(plan.username)}'`,
    );
    if (users.records.length !== 1 || !users.records[0]?.IsActive)
      throw new SfError(messages.getMessage('errors.user'), 'SetupUserUnavailable');
    const userId = users.records[0].Id;
    // Check the registration before provisioning. Runtime readiness is verified after login.
    const registration = await connection
      .request<{ status?: string }>(
        `/services/data/v${DEFAULT_API_VERSION}/ssot/agentic/agent/${encodeURIComponent(plan.agentId)}`,
      )
      .catch(() => undefined);
    if (registration?.status !== 'ACTIVE')
      throw new SfError(messages.getMessage('errors.agent'), 'SetupAgentUnavailable');
    const readSettings = async (): Promise<Record<string, MetadataRecord>> => {
      const definitions = [
        ['app', 'ExternalClientApplication', plan.appName],
        ['global', 'ExtlClntAppGlobalOauthSettings', plan.appName],
        ['oauth', 'ExtlClntAppOauthSettings', plan.appName],
        ['policy', 'ExtlClntAppOauthConfigurablePolicies', `${plan.appName}_defaultPolicy`],
        ['appPolicy', 'ExtlClntAppConfigurablePolicies', `${plan.appName}_defaultPolicy`],
        ['permission', 'PermissionSet', plan.permissionSet],
      ] as const;
      const entries = await Promise.all(
        definitions.map(async ([key, type, name]) => {
          const value = (await connection.metadata.read(
            type as Parameters<typeof connection.metadata.read>[0],
            name,
          )) as unknown as MetadataRecord;
          return [key, value] as const;
        }),
      );
      return Object.fromEntries(entries.filter(([, value]) => value.fullName && value.label));
    };
    let records = await readSettings();
    const reuse = Boolean(records.app);
    if (!reuse && Object.keys(records).length)
      throw new SfError(messages.getMessage('errors.partial'), 'SetupPartialConfiguration');
    const keys = await keyPair(plan.keyDirectory, !reuse);
    let deploymentId: unknown;
    if (!reuse) {
      const project = await mkdtemp(join(tmpdir(), 'ace-setup-'));
      try {
        await writeFile(
          join(project, 'sfdx-project.json'),
          JSON.stringify({
            packageDirectories: [{ path: 'force-app', default: true }],
            sourceApiVersion: DEFAULT_API_VERSION,
            namespace: '',
          }),
          { mode: 0o600 },
        );
        for (const [path, contents] of Object.entries(setupMetadata(plan, keys.certificate))) {
          const file = join(project, 'force-app/main/default', path);
          await mkdir(dirname(file), { recursive: true, mode: 0o700 });
          await writeFile(file, contents, { mode: 0o600 });
        }
        const deployed = await sfJson(
          ['project', 'deploy', 'start', '--target-org', plan.admin, '--source-dir', 'force-app', '--wait', '3'],
          project,
        );
        deploymentId = deployed.id;
        if (deployed.status !== 'Succeeded')
          throw new SfError(messages.getMessage('errors.deploy'), 'SetupDeploymentIncomplete');
      } finally {
        await rm(project, { recursive: true, force: true });
      }
      records = await readSettings();
    }
    const consumerKey = verifySetupMetadata(plan, keys.certificate, records);
    // The preauthorization permission set must grant no unrelated object/system access.
    const permission = records.permission;
    const safeFields = new Set(['fullName', 'label', 'description', 'hasActivationRequired', 'type']);
    if (
      !permission ||
      Object.keys(permission).some(
        (key) =>
          !safeFields.has(key) &&
          permission[key] !== undefined &&
          permission[key] !== null &&
          (!Array.isArray(permission[key]) || (permission[key] as unknown[]).length),
      )
    )
      throw new SfError(messages.getMessage('errors.permission'), 'SetupPermissionMismatch');
    const assigned = await connection.query(
      `SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${userId}' AND PermissionSet.Name = '${plan.permissionSet}'`,
    );
    if (!assigned.records.length)
      await sfJson([
        'org',
        'assign',
        'permset',
        '--target-org',
        plan.admin,
        '--name',
        plan.permissionSet,
        '--on-behalf-of',
        plan.username,
      ]);
    const loginArgs = [
      'org',
      'login',
      'jwt',
      '--username',
      plan.username,
      '--jwt-key-file',
      keys.keyFile,
      '--client-id',
      consumerKey,
      '--instance-url',
      plan.instanceUrl,
      '--alias',
      plan.alias,
    ];
    // sf drops other aliases for this username when --alias is set; put them back.
    const previousAliases = (await StateAggregator.getInstance()).aliases
      .getAll(plan.username)
      .filter((alias) => alias !== plan.alias);
    await sfJson(loginArgs);
    StateAggregator.clearInstance();
    const state = await StateAggregator.getInstance();
    for (const alias of previousAliases) await state.aliases.setAndSave(alias, plan.username);
    const stored = await state.orgs.read(plan.username, true, true);
    if (stored?.clientId !== consumerKey || stored.privateKey !== keys.keyFile || stored.username !== plan.username)
      throw new SfError(messages.getMessage('errors.identity'), 'SetupIdentityMismatch');
    const runtimeOrg = await Org.create({ aliasOrUsername: plan.username });
    await runtimeOrg.refreshAuth();
    const runtimeConnection = runtimeOrg.getConnection();
    if (runtimeOrg.getOrgId().slice(0, 15) !== plan.orgId.slice(0, 15) || !runtimeConnection.accessToken)
      throw new SfError(messages.getMessage('errors.identity'), 'SetupIdentityMismatch');
    const transport = new AceTransport();
    const runtime = await transport.exchange({
      origin: runtimeConnection.instanceUrl,
      token: runtimeConnection.accessToken,
    });
    const operation = operationFor('ace conversation list');
    const values = { 'agent-id': plan.agentId, 'owner-id': userId, 'owner-type': 'employee' };
    const result = await transport.execute(
      planRequest(operation, values, undefined, `org:${plan.orgId}:${plan.username}`),
      runtime,
      operation,
      values,
    );
    const receipt = {
      state: 'ready',
      appName: plan.appName,
      permissionSet: plan.permissionSet,
      username: plan.username,
      orgId: plan.orgId,
      alias: plan.alias,
      reused: reuse,
      permissionAssigned: !assigned.records.length,
      deploymentId,
      keyFile: keys.keyFile,
      consumerKey,
      runtimeCheck: { operation: operation.command, httpStatus: result.httpStatus },
      ciCommand: `sf ${loginArgs.map(shellQuote).join(' ')}`,
      note: messages.getMessage('note'),
    };
    // Write then rename so an interrupted run never leaves a truncated receipt.
    const receiptPath = join(plan.keyDirectory, 'setup.json');
    await writeFile(`${receiptPath}.tmp`, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    await rename(`${receiptPath}.tmp`, receiptPath);
    return this.output(receipt);
  }

  private output(value: Record<string, unknown>): Record<string, unknown> {
    if (!this.jsonEnabled()) this.logJson(value);
    return value;
  }
}
