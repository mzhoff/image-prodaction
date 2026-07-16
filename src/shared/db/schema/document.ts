import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { user } from './auth';
import { workspace } from './workspace';

export const documentStatus = pgEnum('document_status', ['active', 'trash']);

export const document = pgTable('document', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  status: documentStatus('status').default('active').notNull(),
  snapshot: jsonb('snapshot').$type<ProjectExport | null>(),
  schemaVersion: integer('schema_version').default(1).notNull(),
  revision: integer('revision').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  trashedAt: timestamp('trashed_at', { withTimezone: true }),
}, (table) => [
  index('document_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
]);

export const documentPreference = pgTable('document_preference', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => document.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  favorite: boolean('favorite').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  primaryKey({ columns: [table.documentId, table.userId], name: 'document_preference_pk' }),
  index('document_preference_user_favorite_idx').on(table.userId, table.favorite),
]);

export const documentRelations = relations(document, ({ many, one }) => ({
  creator: one(user, { fields: [document.createdByUserId], references: [user.id] }),
  preferences: many(documentPreference),
  workspace: one(workspace, { fields: [document.workspaceId], references: [workspace.id] }),
}));

export const documentPreferenceRelations = relations(documentPreference, ({ one }) => ({
  document: one(document, { fields: [documentPreference.documentId], references: [document.id] }),
  user: one(user, { fields: [documentPreference.userId], references: [user.id] }),
}));
