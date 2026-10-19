import { z } from 'zod';
export * from './agent.js';
export * from './models.js';
export * from './continuity.js';
export * from './knowledge.js';

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(['directory', 'file']),
});
export type WorkspaceEntry = z.infer<typeof workspaceEntrySchema>;
export const directorySchema = z.object({
  path: z.string(),
  entries: z.array(workspaceEntrySchema),
  truncated: z.boolean(),
});
export const workspaceFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  content: z.string(),
  language: z.string(),
  bytes: z.number(),
});
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;

export const sessionStatusSchema = z.enum(['idle', 'running', 'interrupted']);
export const sessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;
export const createSessionSchema = z.object({ title: z.string().trim().min(1).max(120) });

export const healthSchema = z.object({
  status: z.literal('ready'),
  version: z.string(),
  startedAt: z.string(),
  node: z.string(),
  platform: z.string(),
  database: z.object({
    status: z.literal('ready'),
    fts5: z.literal(true),
    schemaVersion: z.number(),
  }),
  terminal: z.object({ shell: z.string(), active: z.number(), isolation: z.literal('host') }),
  agent: z.enum(['not-configured', 'configured', 'ready']),
});
export type Health = z.infer<typeof healthSchema>;

export const eventSchema = z.object({
  id: z.number().int().positive(),
  workspaceId: z.string(),
  sessionId: z.string().nullable(),
  type: z.enum([
    'session.created',
    'session.interrupted',
    'agent.updated',
    'provider.updated',
    'models.updated',
    'session.updated',
    'knowledge.updated',
  ]),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type RuntimeEvent = z.infer<typeof eventSchema>;

export const terminalClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth'),
    token: z.string(),
    cols: z.number().int().min(20).max(500),
    rows: z.number().int().min(5).max(200),
  }),
  z.object({ type: z.literal('input'), data: z.string().max(65_536) }),
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(20).max(500),
    rows: z.number().int().min(5).max(200),
  }),
]);
export type TerminalClientMessage = z.infer<typeof terminalClientMessageSchema>;
export type TerminalServerMessage =
  | { type: 'ready'; id: string; shell: string }
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string };
