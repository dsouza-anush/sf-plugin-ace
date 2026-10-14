import { createHash } from 'node:crypto';
import { Messages, SfError } from '@salesforce/core';
import { bodies, DEFAULT_API_VERSION, operationFor, type Operation } from './contracts.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'client');

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

const DETAIL_LIMIT = 300;

/**
 * Extracts only Salesforce's structured error fields from a failed response: `errorCode`/`message`
 * (REST), `error`/`error_description` (OAuth), or `title`/`detail` (RFC 9457 problem details).
 * Raw bodies are never surfaced, the bearer token is redacted, and the detail is capped.
 */
export async function errorDetail(response: Response, token: string): Promise<string | undefined> {
  let value: unknown;
  try {
    value = JSON.parse(await response.text()) as unknown;
  } catch {
    return undefined;
  }
  const first = Array.isArray(value) ? (value[0] as unknown) : value;
  if (!first || typeof first !== 'object') return undefined;
  const field = (name: string): string | undefined => {
    const item = (first as Record<string, unknown>)[name];
    return typeof item === 'string' && item.trim() ? item : undefined;
  };
  const code = field('errorCode') ?? field('error') ?? field('title');
  const text = field('message') ?? field('error_description') ?? field('detail');
  if (!code && !text) return undefined;
  let detail = [code, text].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
  if (token) detail = detail.replaceAll(token, '[redacted]');
  return detail.length > DETAIL_LIMIT ? `${detail.slice(0, DETAIL_LIMIT - 1)}…` : detail;
}

export function origin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error();
    return url.origin;
  } catch {
    throw new SfError(messages.getMessage('errors.origin'), 'InvalidOrigin');
  }
}

export function planRequest(
  operation: Operation,
  values: Values,
  body: unknown,
  target: string,
  apiVersion = DEFAULT_API_VERSION,
): Plan {
  if (!/^\d+\.0$/.test(apiVersion) || Number(apiVersion) < 66)
    throw new SfError(messages.getMessage('errors.api-version'), 'InvalidApiVersion');
  let path = operation.path;
  const query: Array<[string, string]> = [];
  const headers: Record<string, string> = {};
  for (const parameter of operation.parameters) {
    const value = values[parameter.name];
    if (value === undefined) {
      if (parameter.required)
        throw new SfError(messages.getMessage('errors.required', [parameter.name]), 'MissingParameter');
      continue;
    }
    const items = Array.isArray(value) ? value : [value];
    if (
      items.length === 0 ||
      items.some((item) => typeof item === 'boolean' || !String(item).trim() || /[\r\n]/.test(String(item)))
    )
      throw new SfError(messages.getMessage('errors.parameter', [parameter.name]), 'InvalidParameter');
    if (parameter.kind !== 'multiple' && items.length !== 1)
      throw new SfError(messages.getMessage('errors.single', [parameter.name]), 'InvalidParameter');
    for (const item of items) {
      if (parameter.options && !parameter.options.includes(String(item)))
        throw new SfError(messages.getMessage('errors.parameter', [parameter.name]), 'InvalidParameter');
      if (
        parameter.kind === 'integer' &&
        (!Number.isSafeInteger(item) ||
          Number(item) < (parameter.min ?? 0) ||
          Number(item) > (parameter.max ?? Number.MAX_SAFE_INTEGER))
      )
        throw new SfError(messages.getMessage('errors.integer', [parameter.name]), 'InvalidParameter');
      if (parameter.location === 'query') query.push([parameter.wire, String(item)]);
    }
    if (parameter.location === 'path') {
      if (value === '.' || value === '..')
        throw new SfError(messages.getMessage('errors.dot-segment'), 'InvalidParameter');
      path = path.replace(`{${parameter.wire}}`, encodeURIComponent(String(value)));
    }
    if (parameter.location === 'header') headers[parameter.wire] = String(value);
  }
  // Live runtime compatibility: context routing requires this header as well as the published query parameter.
  if (operation.command === 'ace context get') headers['ctx-agent-id'] = String(values['agent-id']);
  if (operation.command === 'ace context get' && values['owner-id'] && !values['owner-type'])
    throw new SfError(messages.getMessage('errors.owner-type'), 'MissingOwnerType');
  let parsedBody: unknown;
  if (operation.body) {
    const parsed = bodies[operation.body].safeParse(body);
    if (!parsed.success)
      throw new SfError(
        messages.getMessage('errors.body', [
          parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.code}`).join('; '),
        ]),
        'InvalidBody',
      );
    parsedBody = parsed.data;
  } else if (body !== undefined) throw new SfError(messages.getMessage('errors.unexpected-body'), 'UnexpectedBody');
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

export function planSessionProjection(values: Values, target: string, apiVersion = DEFAULT_API_VERSION): Plan {
  for (const name of ['time-range', 'participant-id']) {
    if (values[name] !== undefined)
      throw new SfError(messages.getMessage('errors.projection-filter', [name]), 'UnsupportedProjectionFilter');
  }
  const fields = values.fields as string[] | undefined;
  if (
    fields &&
    (!Array.isArray(fields) ||
      fields.length === 0 ||
      fields.some((field) => !['id', 'startTime', 'status'].includes(field)))
  )
    throw new SfError(messages.getMessage('errors.projection-field'), 'UnsupportedProjectionField');
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
    throw new SfError(messages.getMessage('errors.projection-array'), 'InvalidSessionProjection');
  const sessions = data.sessions
    .map((session: unknown) => {
      if (!session || typeof session !== 'object' || !('sessionId' in session) || typeof session.sessionId !== 'string')
        throw new SfError(messages.getMessage('errors.projection-id'), 'InvalidSessionProjection');
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
  if (!allow) throw new SfError(messages.getMessage('errors.writes-disabled'), 'WritesDisabled');
  if (!confirmed) throw new SfError(messages.getMessage('errors.confirmation'), 'ConfirmationRequired');
}

function continuationFor(operation: Operation, values: Values, data: unknown): Result['continuation'] {
  if (!operation.paginated || !data || typeof data !== 'object') return undefined;
  const flags: Values = {};
  for (const parameter of operation.parameters)
    if (values[parameter.name] !== undefined) flags[parameter.name] = values[parameter.name];

  if (operation.command === 'ace agent list') {
    // Use the returned page boundaries, never an assumed service page size.
    if (!('agents' in data) || !Array.isArray(data.agents) || data.agents.length === 0) return undefined;
    if (!('offset' in data) || typeof data.offset !== 'number' || !Number.isSafeInteger(data.offset) || data.offset < 0)
      return undefined;
    if (
      !('limit' in data) ||
      typeof data.limit !== 'number' ||
      !Number.isSafeInteger(data.limit) ||
      data.limit < data.agents.length ||
      data.limit > 200
    )
      return undefined;
    // totalSize can describe this page rather than the complete collection.
    // Only a short page establishes completion; an exact final page needs one empty read.
    if (data.agents.length < data.limit) return undefined;
    const nextOffset = data.offset + data.agents.length;
    if (!Number.isSafeInteger(nextOffset)) return undefined;
    flags.offset = nextOffset;
    flags.limit = data.limit;
  } else {
    if (!('nextPageToken' in data) || typeof data.nextPageToken !== 'string' || !data.nextPageToken) return undefined;
    flags['page-token'] = data.nextPageToken;
  }
  return { command: operation.command, flags };
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
      throw new SfError(messages.getMessage('errors.exchange'), 'RuntimeAuthFailed');
    }
    if (!response.ok) {
      const detail = await errorDetail(response, session.token);
      if (detail?.startsWith('invalid_scope'))
        throw new SfError(messages.getMessage('errors.exchange-scope'), 'RuntimeScopeMissing', [
          messages.getMessage('actions.exchange-scope'),
        ]);
      throw new SfError(
        messages.getMessage('errors.exchange-http', [response.status + (detail ? ` (${detail})` : '')]),
        'RuntimeAuthFailed',
      );
    }
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
      throw new SfError(messages.getMessage('errors.runtime-session'), 'InvalidRuntimeSession');
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
        plan.method === 'GET' ? messages.getMessage('errors.read-failed') : messages.getMessage('errors.write-unknown'),
        plan.method === 'GET' ? 'TransportFailed' : 'WriteOutcomeUnknown',
      );
    }
    if (!response.ok) {
      const detail = await errorDetail(response, session.token);
      throw new SfError(
        messages.getMessage('errors.http', [
          response.status + (detail ? ` (${detail})` : ''),
          messages.getMessage(plan.method === 'GET' ? 'errors.read-http' : 'errors.write-http'),
        ]),
        `AceHttp${response.status}`,
      );
    }
    let data: unknown;
    try {
      const text = await response.text();
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      throw new SfError(messages.getMessage('errors.response'), 'InvalidResponse');
    }
    const warnings: string[] = [];
    if (plan.sessionProjection) {
      data = projectSessions(data, plan.sessionProjection);
      warnings.push(messages.getMessage('warnings.projection'));
    }
    if (response.status === 202) warnings.push(messages.getMessage('warnings.accepted'));
    if (operation.warning) warnings.push(messages.getMessage(operation.warning));
    const result: Result = {
      operation: plan.command,
      ...(plan.sessionProjection ? { source: 'conversation' as const } : {}),
      httpStatus: response.status,
      state: response.status === 202 ? 'accepted' : 'responded',
      data,
      warnings,
    };
    const continuation = continuationFor(operation, values, data);
    if (continuation) result.continuation = continuation;
    return result;
  }
}
