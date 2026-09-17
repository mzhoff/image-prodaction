import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { user } from './auth';

export const studioFolder = pgTable('studio_folder', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  systemKey: text('system_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index('studio_folder_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
  uniqueIndex('studio_folder_workspace_id_unique').on(table.workspaceId, table.id),
  uniqueIndex('studio_folder_workspace_system_key_unique').on(table.workspaceId, table.systemKey),
]);
