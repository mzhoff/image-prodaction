import { relations } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { document } from './document';
import { generationJob } from './generation';
import { workspace } from './workspace';

export const assetStatus = pgEnum('asset_status', ['pending', 'ready', 'failed', 'deleted']);
export const assetMediaKind = pgEnum('asset_media_kind', ['image', 'video']);
export const assetOrigin = pgEnum('asset_origin', ['uploaded', 'generated', 'saved', 'unknown']);
export const assetVariantPurpose = pgEnum('asset_variant_purpose', ['thumbnail', 'preview', 'poster']);

export const asset = pgTable('asset', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .references(() => document.id, { onDelete: 'set null' }),
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
  mediaKind: assetMediaKind('media_kind').default('image').notNull(),
  origin: assetOrigin('origin').default('unknown').notNull(),
  libraryVisible: boolean('library_visible').default(false).notNull(),
  provider: text('provider'),
  modelId: text('model_id'),
  operation: text('operation'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  generationJobId: uuid('generation_job_id')
    .references((): AnyPgColumn => generationJob.id, { onDelete: 'set null' }),
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
  index('asset_library_workspace_created_idx').on(
    table.workspaceId,
    table.libraryVisible,
    table.status,
    table.createdAt,
    table.id,
  ),
  index('asset_library_origin_idx').on(table.workspaceId, table.origin),
  index('asset_library_media_kind_idx').on(table.workspaceId, table.mediaKind),
  index('asset_library_model_idx').on(table.workspaceId, table.modelId),
  index('asset_document_idx').on(table.documentId),
  index('asset_creator_idx').on(table.createdByUserId),
  index('asset_generation_job_idx').on(table.generationJobId),
]);

export const assetVariant = pgTable('asset_variant', {
  id: uuid('id').primaryKey(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => asset.id, { onDelete: 'cascade' }),
  purpose: assetVariantPurpose('purpose').notNull(),
  bucket: text('bucket').notNull(),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  checksumSha256: text('checksum_sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('asset_variant_asset_purpose_unique').on(table.assetId, table.purpose),
  uniqueIndex('asset_variant_storage_key_unique').on(table.bucket, table.storageKey),
  index('asset_variant_asset_idx').on(table.assetId),
]);

export const assetRelations = relations(asset, ({ many, one }) => ({
  createdBy: one(user, {
    fields: [asset.createdByUserId],
    references: [user.id],
  }),
  document: one(document, {
    fields: [asset.documentId],
    references: [document.id],
  }),
  workspace: one(workspace, {
    fields: [asset.workspaceId],
    references: [workspace.id],
  }),
  generationJob: one(generationJob, {
    fields: [asset.generationJobId],
    references: [generationJob.id],
  }),
  variants: many(assetVariant),
}));

export const assetVariantRelations = relations(assetVariant, ({ one }) => ({
  asset: one(asset, {
    fields: [assetVariant.assetId],
    references: [asset.id],
  }),
}));
