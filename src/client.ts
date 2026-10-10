import { createHash } from 'node:crypto';
import { SfError } from '@salesforce/core';
import { bodies, operationFor, type Operation } from './contracts.js';

export type Values = Record<string, string | number | string[] | boolean | undefined>;
export type Plan = {
  command: string;
  surface: Operation['surface'];
  method: Operation['method'];
  path: string;
  query: Array<[string, string]>;
  headers: Record<string, string>;
  body?: unknown;
  target: string;
  fingerprint: string;
  sessionProjection?: { status?: string; fields?: string[] };
};
export type Result = {
  operation: string;
  httpStatus: number;
  state: 'accepted' | 'responded';
  data: unknown;
  continuation?: { command: string; flags: Values };
  warnings: string[];
  source?: 'conversation';
};
export type Session = { origin: string; token: string };

export function origin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error();
    return url.origin;
  } catch {
    throw new SfError('Use a verified HTTPS origin without a path, credentials, query, or fragment.', 'InvalidOrigin');
  }
}

export function planRequest(
  operation: Operation,
  values: Values,
  body: unknown,
  target: string,
  apiVersion = '68.0',
): Plan {
  if (!/^\d+\.0$/.test(apiVersion) || Number(apiVersion) < 66)
    throw new SfError('Agent Configuration requires API version 66.0 or later.', 'InvalidApiVersion');
  let path = operation.path;
  const query: Array<[string, string]> = [];
  const headers: Record<string, string> = {};
  for (const parameter of operation.parameters) {
    const value = values[parameter.name];
    if (value === undefined) {
      if (parameter.required) throw new SfError(`Provide --${parameter.name}.`, 'MissingParameter');
      continue;
    }
    const items = Array.isArray(value) ? value : [value];
    if (
      items.length === 0 ||
      items.some((item) => typeof item === 'boolean' || !String(item).trim() || /[\r\n]/.test(String(item)))
    )
      throw new SfError(`Invalid --${parameter.name}.`, 'InvalidParameter');
    if (parameter.kind !== 'multiple' && items.length !== 1)
      throw new SfError(`Provide one --${parameter.name}.`, 'InvalidParameter');
    for (const item of items) {
      if (parameter.options && !parameter.options.includes(String(item)))
        throw new SfError(`Invalid --${parameter.name}.`, 'InvalidParameter');
      if (
        parameter.kind === 'integer' &&
        (!Number.isSafeInteger(item) ||
          Number(item) < (parameter.min ?? 0) ||
          Number(item) > (parameter.max ?? Number.MAX_SAFE_INTEGER))
      )
        throw new SfError(`Invalid --${parameter.name} integer.`, 'InvalidParameter');
      if (parameter.location === 'query') query.push([parameter.wire, String(item)]);
    }
    if (parameter.location === 'path') {
      if (value === '.' || value === '..')
        throw new SfError('Path identifiers cannot be dot segments.', 'InvalidParameter');
      path = path.replace(`{${parameter.wire}}`, encodeURIComponent(String(value)));
    }
    if (parameter.location === 'header') headers[parameter.wire] = String(value);
  }
  // Live runtime compatibility: context routing requires this header as well as the published query parameter.
  if (operation.command === 'ace context get') headers['ctx-agent-id'] = String(values['agent-id']);
  if (operation.command === 'ace context get' && values['owner-id'] && !values['owner-type'])
    throw new SfError('Provide --owner-type with --owner-id.', 'MissingOwnerType');
  let parsedBody: unknown;
  if (operation.body) {
    const parsed = bodies[operation.body].safeParse(body);
    if (!parsed.success)
      throw new SfError(
        `Invalid request body: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.code}`).join('; ')}. See command help and the API reference.`,
        'InvalidBody',
      );
    parsedBody = parsed.data;
  } else if (body !== undefined) throw new SfError('This operation does not accept a body.', 'UnexpectedBody');
  const base = operation.surface === 'configuration' ? `/services/data/v${apiVersion}/ssot/agentic` : '/api/v1/agentic';
  const request = {
    command: operation.command,
    surface: operation.surface,
    method: operation.method,
    path: base + path,
    query,
    headers,
    ...(parsedBody !== undefined ? { body: parsedBody } : {}),
    target,
  };
  return { ...request, fingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex') };
}

export function planSessionProjection(values: Values, target: string, apiVersion = '68.0'): Plan {
  for (const name of ['time-range', 'participant-id']) {
    if (values[name] !== undefined)
      throw new SfError(
        `--${name} is not supported with --source conversation. Use --source index.`,
        'UnsupportedProjectionFilter',
      );
  }
  const fields = values.fields as string[] | undefined;
  if (
    fields &&
    (!Array.isArray(fields) ||
      fields.length === 0 ||
      fields.some((field) => !['id', 'startTime', 'status'].includes(field)))
  )
    throw new SfError(
      'Conversation source supports only id, startTime, and status fields.',
      'UnsupportedProjectionField',
    );
  // Validate the original list inputs before selecting the supported graph route.
  planRequest(operationFor('ace session list'), values, undefined, target, apiVersion);
  const graph = planRequest(
    operationFor('ace conversation get'),
    { ...values, scope: 'all' },
    undefined,
    target,
    apiVersion,
  );
  const plan = {
    ...graph,
    command: 'ace session list',
    sessionProjection: {
      ...(values.status !== undefined ? { status: String(values.status) } : {}),
      ...(fields ? { fields } : {}),
    },
  };
  return { ...plan, fingerprint: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

export function projectSessions(data: unknown, projection: NonNullable<Plan['sessionProjection']>): unknown {
  if (!data || typeof data !== 'object' || !('sessions' in data) || !Array.isArray(data.sessions))
    throw new SfError(
      'Conversation response did not contain a session array; no session result was inferred.',
      'InvalidSessionProjection',
    );
  const sessions = data.sessions
    .map((session: unknown) => {
      if (!session || typeof session !== 'object' || !('sessionId' in session) || typeof session.sessionId !== 'string')
        throw new SfError('Conversation response contained an invalid session identifier.', 'InvalidSessionProjection');
      const row: Record<string, unknown> = { id: session.sessionId };
      for (const field of ['startTime', 'status'])
        if (field in session) row[field] = (session as Record<string, unknown>)[field];
      return row;
    })
    .filter((row) => projection.status === undefined || row.status === projection.status)
    .map((row) =>
      projection.fields
        ? Object.fromEntries(projection.fields.filter((field) => field in row).map((field) => [field, row[field]]))
        : row,
    );
  return {
    ...('conversationId' in data ? { conversationId: data.conversationId } : {}),
    sessions,
    ...('nextPageToken' in data ? { nextPageToken: data.nextPageToken } : {}),
  };
}

export function requireWriteApproval(plan: Plan, allow: boolean, confirmed: boolean): void {
  if (plan.method === 'GET') return;
  if (!allow)
    throw new SfError('Writes are disabled. Review --dry-run, then explicitly pass --allow-write.', 'WritesDisabled');
  if (!confirmed)
    throw new SfError(
      'Write not confirmed. For automation, pass --no-prompt --confirm with the fingerprint from --dry-run.',
      'ConfirmationRequired',
    );
}

export class AceTransport {
  public constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  public async exchange(session: Session): Promise<Session> {
    let response: Response;
    try {
      response = await this.request(new URL('/services/a360/token', origin(session.origin)), {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'urn:salesforce:grant-type:external:cdp',
          subject_token: session.token,
          subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        }),
      });
    } catch {
      throw new SfError(
        'Runtime token exchange failed. Check the authorized Salesforce connection.',
        'RuntimeAuthFailed',
      );
    }
    if (!response.ok)
      throw new SfError(
        `Runtime token exchange returned HTTP ${response.status}. Check OAuth scopes and tenant provisioning.`,
        'RuntimeAuthFailed',
      );
    try {
      const value: unknown = await response.json();
      if (
        !value ||
        typeof value !== 'object' ||
        !('access_token' in value) ||
        typeof value.access_token !== 'string' ||
        !value.access_token ||
        !('instance_url' in value) ||
        typeof value.instance_url !== 'string'
      )
        throw new Error();
      if ('token_type' in value && String(value.token_type).toLowerCase() !== 'bearer') throw new Error();
      const returnedOrigin = origin(
        value.instance_url.includes('://') ? value.instance_url : `https://${value.instance_url}`,
      );
      if (!new URL(returnedOrigin).hostname.endsWith('.salesforce.com')) throw new Error();
      return { origin: returnedOrigin, token: value.access_token };
    } catch {
      throw new SfError('Salesforce did not return a usable runtime token and tenant origin.', 'InvalidRuntimeSession');
    }
  }

  public async execute(plan: Plan, session: Session, operation: Operation, values: Values): Promise<Result> {
    const url = new URL(plan.path, origin(session.origin));
    for (const [key, value] of plan.query) url.searchParams.append(key, value);
    let response: Response;
    try {
      response = await this.request(url, {
        method: plan.method,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.token}`,
          ...plan.headers,
          ...(plan.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(plan.body !== undefined ? { body: JSON.stringify(plan.body) } : {}),
      });
    } catch {
      throw new SfError(
        plan.method === 'GET'
          ? 'Read failed or timed out. Check authentication and connectivity.'
          : 'Write outcome is unknown. Read the affected state before retrying; no automatic retry was made.',
        plan.method === 'GET' ? 'TransportFailed' : 'WriteOutcomeUnknown',
      );
    }
    if (!response.ok)
      throw new SfError(
        `ACE returned HTTP ${response.status}. ${plan.method === 'GET' ? 'Check permissions, identity, and inputs.' : 'Read the affected state before retrying.'}`,
        `AceHttp${response.status}`,
      );
    let data: unknown;
    try {
      const text = await response.text();
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      throw new SfError(
        'ACE returned an unreadable response. For writes, verify current state before retrying.',
        'InvalidResponse',
      );
    }
    const warnings: string[] = [];
    if (plan.sessionProjection) {
      data = projectSessions(data, plan.sessionProjection);
      warnings.push(
        'Session summaries are projected from the conversation API, not the session index. Missing fields remain absent. Pagination follows the conversation API.',
      );
    }
    if (response.status === 202)
      warnings.push('Accepted by Salesforce; asynchronous completion and memory extraction are not verified.');
    if (operation.command === 'ace agent create')
      warnings.push(
        'Registration response received; use ace agent get to verify Active status. Additional graph readiness is separate.',
      );
    if (operation.command === 'ace context get')
      warnings.push('Fast mode does not apply token_budget or latency_sensitivity.');
    if (operation.command === 'ace memory update')
      warnings.push('Updated memories may have new identifiers; use the returned identifiers.');
    const result: Result = {
      operation: plan.command,
      ...(plan.sessionProjection ? { source: 'conversation' as const } : {}),
      httpStatus: response.status,
      state: response.status === 202 ? 'accepted' : 'responded',
      data,
      warnings,
    };
    if (
      operation.paginated &&
      data &&
      typeof data === 'object' &&
      'nextPageToken' in data &&
      typeof data.nextPageToken === 'string' &&
      data.nextPageToken
    ) {
      const flags: Values = {};
      for (const parameter of operation.parameters)
        if (values[parameter.name] !== undefined) flags[parameter.name] = values[parameter.name];
      flags['page-token'] = data.nextPageToken;
      result.continuation = { command: plan.command, flags };
    }
    return result;
  }
}
