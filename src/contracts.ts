import { z } from 'zod';

// Published operation inventory: docs/API-COVERAGE.md. This module has no CLI or MCP dependency.
const id = z.string().trim().min(1);
const ownerType = z.enum(['individual', 'employee']);
const participant = z.object({ id, type: id, role: z.enum(['owner', 'participant']) }).strict();
const variables = z.record(z.string(), z.json());
const entry = z
  .object({
    id: id.optional(),
    interactionId: id.optional(),
    participantId: id,
    content: z.string().optional(),
    category: z.enum(['Message', 'Trace', 'Entry']).default('Message'),
    type: z.enum(['user_message', 'agent_response', 'agent_reasoning', 'tool_call', 'tool_result']).optional(),
    role: id.optional(),
    timestamp: z.iso.datetime({ offset: true }).optional(),
    attachments: z.array(z.object({ contentType: id, contentUrl: z.url() }).strict()).optional(),
    variable: variables.optional(),
  })
  .strict()
  .refine(
    (value) => value.category !== 'Message' || Boolean(value.content?.trim()),
    'Message entries require content.',
  );

export const bodies = {
  agent: z
    .object({
      name: id,
      label: id,
      description: z.string().optional(),
      dataspaceName: id.optional(),
      dataSpaceName: id.optional(),
      configuration: z
        .object({
          isMemoryGenerationEnabled: z.boolean().optional(),
          profileDmos: z.array(z.object({ name: id }).strict()).optional(),
          contextDataSources: z
            .object({ dataGraphs: z.array(z.object({ name: id }).strict()) })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict()
    .refine(
      (value) => Boolean(value.dataspaceName) !== Boolean(value.dataSpaceName),
      'Provide exactly one data space spelling; consult the documented casing discrepancy.',
    ),
  conversation: z
    .object({
      conversationId: id,
      conversationOwnerId: id,
      ownerType,
      name: z.string().optional(),
      channel: z
        .object({ type: z.enum(['web', 'chat', 'voice', 'sms', 'email', 'other']), id })
        .strict()
        .optional(),
      variable: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
  session: z
    .object({
      sessionId: id,
      conversationOwnerId: id,
      ownerType,
      participants: z
        .array(
          participant.extend({
            startTime: z.iso.datetime({ offset: true }).optional(),
            endTime: z.iso.datetime({ offset: true }).nullable().optional(),
            orgId: id.optional(),
          }),
        )
        .min(1),
      variable: variables.optional(),
    })
    .strict(),
  participants: z.object({ participants: z.array(participant).min(1) }).strict(),
  entries: z.object({ sessionId: id, entries: z.array(entry).min(1) }).strict(),
  memoryCreate: z.object({ memories: z.array(z.object({ content: z.string().min(1) }).strict()).min(1) }).strict(),
  memoryUpdate: z
    .object({ memories: z.array(z.object({ memoryId: id, content: z.string().min(1) }).strict()).min(1) })
    .strict(),
  memoryDelete: z.object({ memories: z.array(z.object({ memoryId: id }).strict()).min(1) }).strict(),
};

export const DEFAULT_API_VERSION = '68.0';

export type Parameter = {
  name: string;
  location: 'path' | 'query' | 'header';
  wire: string;
  required?: boolean;
  options?: string[];
  kind?: 'integer' | 'multiple';
  min?: number;
  max?: number;
};
export type Operation = {
  command: string;
  surface: 'configuration' | 'runtime';
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  parameters: Parameter[];
  body?: keyof typeof bodies;
  paginated?: boolean;
  /** Message key in client.md for a caveat attached to every result of this operation. */
  warning?: string;
};
const param = (name: string, location: Parameter['location'], wire: string, required = false): Parameter => ({
  name,
  location,
  wire,
  required,
});
const agent = param('agent-id', 'header', 'agent_id', true);
const conversation = param('conversation-id', 'path', 'conversationId', true);
const session = param('session-id', 'path', 'sessionId', true);
const owner = [
  param('owner-id', 'query', 'owner_id', true),
  { ...param('owner-type', 'query', 'owner_type', true), options: ['individual', 'employee'] },
];
const filters: Parameter[] = [
  param('status', 'query', 'status'),
  param('time-range', 'query', 'time_range'),
  { ...param('fields', 'query', 'fields'), kind: 'multiple' },
  param('participant-id', 'query', 'participant_id'),
  param('page-token', 'query', 'page_token'),
];
const profile: Parameter[] = [
  param('profile-id', 'query', 'profile_id', true),
  { ...param('profile-type', 'query', 'profile_type', true), options: ['individual', 'employee'] },
  param('category', 'query', 'category', true),
  { ...agent, required: false },
];
export const operations: Operation[] = [
  {
    command: 'ace agent list',
    surface: 'configuration',
    method: 'GET',
    path: '/agents',
    paginated: true,
    parameters: [
      { ...param('limit', 'query', 'limit'), kind: 'integer', min: 1, max: 200 },
      { ...param('offset', 'query', 'offset'), kind: 'integer', min: 0 },
      param('filters', 'query', 'filters'),
      { ...param('order-by', 'query', 'orderBy'), options: ['ASC', 'DESC'] },
    ],
  },
  {
    command: 'ace agent get',
    surface: 'configuration',
    method: 'GET',
    path: '/agent/{agentId}',
    parameters: [param('agent-id', 'path', 'agentId', true)],
  },
  {
    command: 'ace agent create',
    surface: 'configuration',
    method: 'POST',
    path: '/agent',
    parameters: [],
    body: 'agent',
    warning: 'warnings.registration',
  },
  {
    command: 'ace agent delete',
    surface: 'configuration',
    method: 'DELETE',
    path: '/agent/{agentId}',
    parameters: [param('agent-id', 'path', 'agentId', true)],
  },
  {
    command: 'ace conversation list',
    surface: 'runtime',
    method: 'GET',
    path: '/conversations',
    parameters: [agent, ...owner, ...filters],
    paginated: true,
  },
  {
    command: 'ace conversation get',
    surface: 'runtime',
    method: 'GET',
    path: '/conversations/{conversationId}',
    parameters: [
      agent,
      conversation,
      ...owner.map((p) => (p.name === 'owner-type' ? { ...p, required: false } : p)),
      param('session-id', 'query', 'session_id'),
      param('participant-id', 'query', 'participant_id'),
      { ...param('scope', 'query', 'scope'), options: ['messages', 'traces', 'all'] },
      param('page-token', 'query', 'page_token'),
    ],
    paginated: true,
  },
  {
    command: 'ace conversation create',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations',
    parameters: [agent],
    body: 'conversation',
  },
  {
    command: 'ace conversation close',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations/{conversationId}/close',
    parameters: [agent, conversation],
  },
  {
    command: 'ace session list',
    surface: 'runtime',
    method: 'GET',
    path: '/conversations/{conversationId}/sessions',
    parameters: [agent, conversation, ...owner, ...filters],
    paginated: true,
  },
  {
    command: 'ace session create',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations/{conversationId}/sessions',
    parameters: [agent, conversation],
    body: 'session',
  },
  {
    command: 'ace session close',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations/{conversationId}/sessions/{sessionId}/close',
    parameters: [agent, conversation, session],
  },
  {
    command: 'ace participant add',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations/{conversationId}/sessions/{sessionId}/participants',
    parameters: [agent, conversation, session],
    body: 'participants',
  },
  {
    command: 'ace entry add',
    surface: 'runtime',
    method: 'POST',
    path: '/conversations/{conversationId}/entries',
    parameters: [agent, conversation],
    body: 'entries',
  },
  {
    command: 'ace memory read',
    surface: 'runtime',
    method: 'GET',
    path: '/memory',
    parameters: profile,
  },
  {
    command: 'ace memory create',
    surface: 'runtime',
    method: 'POST',
    path: '/memory',
    parameters: profile,
    body: 'memoryCreate',
  },
  {
    command: 'ace memory update',
    surface: 'runtime',
    method: 'POST',
    path: '/memory',
    parameters: profile,
    body: 'memoryUpdate',
    warning: 'warnings.memory-update',
  },
  {
    command: 'ace memory delete',
    surface: 'runtime',
    method: 'DELETE',
    path: '/memory',
    parameters: profile,
    body: 'memoryDelete',
  },
  {
    command: 'ace context get',
    surface: 'runtime',
    method: 'GET',
    path: '/context',
    parameters: [
      { ...agent, location: 'query' },
      param('conversation-id', 'query', 'conversation_id', true),
      ...owner.map((p) => ({ ...p, required: false })),
      { ...param('mode', 'query', 'mode'), options: ['fast'] },
      { ...param('latency-sensitivity', 'query', 'latency_sensitivity'), options: ['low', 'medium', 'high'] },
      { ...param('token-budget', 'query', 'token_budget'), kind: 'integer', min: 1 },
    ],
    warning: 'warnings.fast-mode',
  },
];

export function operationFor(command: string): Operation {
  const operation = operations.find((item) => item.command === command);
  if (!operation) throw new Error('Unknown ACE operation.');
  return operation;
}
