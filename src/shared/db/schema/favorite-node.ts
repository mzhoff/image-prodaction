import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspace } from './workspace';

export const favoriteNodePreset = pgTable('favorite_node_preset', {
  id: uuid('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  nodeType: text('node_type').notNull(),
  payloadVersion: integer('payload_version').notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  payloadBytes: integer('payload_bytes').notNull(),
  fingerprint: text('fingerprint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('favorite_node_preset_user_workspace_fingerprint_unique')
    .on(table.userId, table.workspaceId, table.fingerprint),
  index('favorite_node_preset_user_workspace_updated_idx')
    .on(table.userId, table.workspaceId, table.updatedAt),
  check('favorite_node_preset_payload_version_positive', sql`${table.payloadVersion} > 0`),
  check('favorite_node_preset_payload_bytes_bounded', sql`${table.payloadBytes} > 0 AND ${table.payloadBytes} <= 98304`),
]);
