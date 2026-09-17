import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { user } from './auth';
import { document } from './document';

export const subjectProfile = pgTable('subject_profile', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  sourceDocumentId: uuid('source_document_id').references(() => document.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<unknown>().notNull(),
  revision: integer('revision').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index('subject_profile_workspace_updated_idx').on(table.workspaceId, table.updatedAt, table.id)]);
