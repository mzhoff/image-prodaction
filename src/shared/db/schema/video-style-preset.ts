import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { user } from './auth';
import { asset } from './asset';

export const videoStylePreset = pgTable('video_style_preset', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), style: jsonb('style').$type<unknown>().notNull(),
  coverAssetId: uuid('cover_asset_id').references(() => asset.id, { onDelete: 'set null' }),
  revision: integer('revision').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index('video_style_preset_workspace_updated_idx').on(table.workspaceId, table.updatedAt, table.id)]);
