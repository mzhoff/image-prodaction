import { relations } from 'drizzle-orm';
import { bigint, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const assetStatus = pgEnum('asset_status', ['pending', 'ready', 'failed', 'deleted']);

export const asset = pgTable('asset', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  documentId: uuid('document_id'),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  bucket: text('bucket').notNull(),
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  checksumSha256: text('checksum_sha256').notNull(),
  status: assetStatus('status').default('pending').notNull(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('asset_storage_key_unique').on(table.bucket, table.storageKey),
  index('asset_workspace_status_idx').on(table.workspaceId, table.status),
  index('asset_document_idx').on(table.documentId),
  index('asset_creator_idx').on(table.createdByUserId),
]);

export const assetRelations = relations(asset, ({ one }) => ({
  createdBy: one(user, {
    fields: [asset.createdByUserId],
    references: [user.id],
  }),
}));
