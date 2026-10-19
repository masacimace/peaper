import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ModelSelection } from '@peaper/shared';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  title: text('title').notNull(),
  status: text('status', { enum: ['idle', 'running', 'interrupted'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  sessionId: text('session_id').references(() => sessions.id),
  type: text('type', {
    enum: [
      'session.created',
      'session.interrupted',
      'agent.updated',
      'provider.updated',
      'models.updated',
      'session.updated',
    ],
  }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: text('created_at').notNull(),
});

export const sessionModels = sqliteTable('session_models', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  selection: text('selection', { mode: 'json' }).$type<ModelSelection>().notNull(),
});
