import { readFile } from 'node:fs/promises';
import { Messages, SfError, type Org } from '@salesforce/core';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import type { Interfaces } from '@oclif/core';
import { operationFor, type Operation } from './contracts.js';
import {
  AceTransport,
  origin,
  planRequest,
  planSessionProjection,
  requireWriteApproval,
  type Plan,
  type Result,
  type Session,
  type Values,
} from './client.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'ace');

export function flagsFor(command: string): Interfaces.FlagInput {
  const operation = operationFor(command);
  const flags: Interfaces.FlagInput = {
    'target-org': operation.surface === 'configuration' ? Flags.requiredOrg() : Flags.optionalOrg(),
    'api-version': Flags.orgApiVersion(),
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run') }),
    timeout: Flags.integer({ summary: messages.getMessage('flags.timeout'), min: 1, max: 300, default: 30 }),
  };
  if (operation.surface === 'runtime')
    flags['runtime-origin'] = Flags.string({
      summary: messages.getMessage('flags.runtime-origin'),
      env: 'ACE_RUNTIME_ORIGIN',
    });
  if (command === 'ace session list')
    flags.source = Flags.string({
      summary: messages.getMessage('flags.source'),
      options: ['index', 'conversation'],
      default: 'index',
    });
  if (operation.body)
    flags['body-file'] = Flags.string({ summary: messages.getMessage('flags.body-file'), required: true, char: 'f' });
  if (operation.method !== 'GET') {
    flags['allow-write'] = Flags.boolean({ summary: messages.getMessage('flags.allow-write') });
    flags['no-prompt'] = Flags.boolean({ summary: messages.getMessage('flags.no-prompt') });
    flags.confirm = Flags.string({ summary: messages.getMessage('flags.confirm'), dependsOn: ['no-prompt'] });
  }
  for (const parameter of operation.parameters) {
    const messageKey =
      parameter.name === 'agent-id' && operation.surface === 'runtime' ? 'agent-api-name' : parameter.name;
    const common = { summary: messages.getMessage(`flags.${messageKey}`), required: parameter.required };
    flags[parameter.name] =
      parameter.kind === 'integer'
        ? Flags.integer({ ...common, min: parameter.min, max: parameter.max })
        : parameter.kind === 'multiple'
          ? Flags.string({ ...common, multiple: true })
          : Flags.string({ ...common, ...(parameter.options ? { options: parameter.options } : {}) });
  }
  return flags;
}

async function readBody(file: string): Promise<unknown> {
  try {
    let source: string;
    if (file === '-') {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
      source = Buffer.concat(chunks).toString('utf8');
    } else source = await readFile(file, 'utf8');
    return JSON.parse(source) as unknown;
  } catch {
    throw new SfError(messages.getMessage('errors.body'), 'InvalidBodyFile');
  }
}

export abstract class AceCommand extends SfCommand<Result | { state: 'planned'; plan: Plan }> {
  public static readonly state = 'beta';

  protected async runOperation(command: string): Promise<Result | { state: 'planned'; plan: Plan }> {
    const { flags } = await this.parse(this.constructor as typeof AceCommand);
    const operation: Operation = operationFor(command);
    const org = flags['target-org'] as Org | undefined;
    const apiVersion = (flags['api-version'] as string | undefined) ?? '68.0';
    const explicitOrigin = flags['runtime-origin'] as string | undefined;
    const explicitToken = process.env.ACE_RUNTIME_TOKEN;
    if (operation.surface === 'runtime' && Boolean(explicitOrigin) !== Boolean(explicitToken))
      throw new SfError(messages.getMessage('errors.runtime-pair'), 'RuntimeAuthRequired');
    if (!org && !explicitOrigin) throw new SfError(messages.getMessage('errors.org'), 'OrgRequired');
    const target =
      operation.surface === 'runtime' && explicitOrigin
        ? origin(explicitOrigin)
        : `org:${org?.getOrgId()}:${org?.getUsername()}`;
    const body = flags['body-file'] ? await readBody(String(flags['body-file'])) : undefined;
    const values: Values = {};
    for (const parameter of operation.parameters) values[parameter.name] = flags[parameter.name] as Values[string];
    const plan =
      command === 'ace session list' && flags.source === 'conversation'
        ? planSessionProjection(values, target, apiVersion)
        : planRequest(operation, values, body, target, apiVersion);
    if (flags['dry-run']) {
      const result = { state: 'planned' as const, plan };
      if (!this.jsonEnabled()) this.logJson(result);
      return result;
    }
    if (operation.method !== 'GET') {
      // Enabling writes and approving this exact request are separate decisions.
      requireWriteApproval(plan, Boolean(flags['allow-write']), true);
      let confirmed = false;
      if (flags['no-prompt']) confirmed = flags.confirm === plan.fingerprint;
      else if (process.stdin.isTTY && !this.jsonEnabled()) {
        this.logJson(plan);
        confirmed = await this.confirm({
          message: messages.getMessage('confirm', [command, target]),
          defaultAnswer: false,
        });
      }
      requireWriteApproval(plan, true, confirmed);
    }
    const transport = new AceTransport(fetch, Number(flags.timeout) * 1000);
    let session: Session;
    if (operation.surface === 'runtime' && explicitOrigin && explicitToken)
      session = { origin: origin(explicitOrigin), token: explicitToken };
    else {
      if (!org) throw new SfError(messages.getMessage('errors.org'), 'OrgRequired');
      try {
        await org.refreshAuth();
        const connection = org.getConnection(apiVersion);
        if (!connection.accessToken) throw new Error();
        session = { origin: origin(connection.instanceUrl), token: connection.accessToken };
      } catch {
        throw new SfError(messages.getMessage('errors.auth'), 'SalesforceAuthFailed');
      }
      if (operation.surface === 'runtime') session = await transport.exchange(session);
    }
    const result = await transport.execute(plan, session, operation, values);
    if (result.continuation) {
      if (plan.sessionProjection) result.continuation.flags.source = 'conversation';
      if (org) result.continuation.flags['target-org'] = org.getUsername();
      if (explicitOrigin) result.continuation.flags['runtime-origin'] = explicitOrigin;
      result.continuation.flags['api-version'] = apiVersion;
      result.continuation.flags.timeout = Number(flags.timeout);
    }
    if (!this.jsonEnabled()) this.logJson(result);
    return result;
  }
}
