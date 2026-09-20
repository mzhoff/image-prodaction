import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspace } from './workspace';
export const workspaceAiMemberPolicy = pgTable(
  'workspace_ai_member_policy',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    enabled: boolean('enabled').default(true).notNull(),
    limitUsd: numeric('limit_usd', { precision: 20, scale: 8 }),
    period: text('period').default('lifetime').notNull(),
    mode: text('mode').default('observed').notNull(),
    revision: integer('revision').default(0).notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);
/** One host-observed gateway invocation. Unknown outcomes remain charged as unresolved admission. */
export const workspaceAiChatCall = pgTable(
  'workspace_ai_chat_call',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    model: text('model').notNull(),
    status: text('status').default('pending').notNull(),
    costUsd: numeric('cost_usd', { precision: 20, scale: 8 }),
    inputTokens: numeric('input_tokens', { precision: 20, scale: 0 }),
    outputTokens: numeric('output_tokens', { precision: 20, scale: 0 }),
    totalTokens: numeric('total_tokens', { precision: 20, scale: 0 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('workspace_ai_chat_member_idx').on(t.workspaceId, t.userId, t.createdAt)],
);
