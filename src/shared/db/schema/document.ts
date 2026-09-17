import { relations } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspace } from './workspace';
import { studioFolder } from './studio-folder';

export const documentStatus = pgEnum('document_status', ['active', 'trash']);
export const documentThumbnailMode = pgEnum('document_thumbnail_mode', ['auto', 'manual']);

export const document = pgTable('document', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  folderId: uuid('folder_id'),
  librarySaved: boolean('library_saved').default(false).notNull(),
  status: documentStatus('status').default('active').notNull(),
  snapshot: jsonb('snapshot').$type<unknown | null>(),
  thumbnailAssetId: uuid('thumbnail_asset_id'),
  thumbnailMode: documentThumbnailMode('thumbnail_mode').default('auto').notNull(),
  thumbnailUpdatedAt: timestamp('thumbnail_updated_at', { withTimezone: true }),
  hasEverHadContent: boolean('has_ever_had_content').default(false).notNull(),
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
  index('document_folder_idx').on(table.folderId),
  foreignKey({ name: 'document_workspace_folder_fk', columns: [table.workspaceId, table.folderId],
    foreignColumns: [studioFolder.workspaceId, studioFolder.id] }),
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
