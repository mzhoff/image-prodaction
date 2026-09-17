import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { document } from './document';
import { user } from './auth';
import { workspace } from './workspace';

/** Immutable generation facts persisted as messages in the document's conversation. */
export const documentAssistantEvent = pgTable('document_assistant_event', {
  id: uuid('id').primaryKey(),
  documentId: uuid('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  nodeId: text('node_id').notNull(),
  payload: jsonb('payload').$type<{ model?: string; assetId?: string }>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('document_assistant_event_document_created_idx').on(table.documentId, table.createdAt),
  index('document_assistant_event_workspace_created_idx').on(table.workspaceId, table.createdAt),
]);
