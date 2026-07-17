import { relations, sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspace } from './workspace';

export const providerConnectionStatus = pgEnum('provider_connection_status', [
  'connected',
  'invalid',
  'disconnected',
]);

export const workspaceProviderConnection = pgTable('workspace_provider_connection', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: providerConnectionStatus('status').default('disconnected').notNull(),
  providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown> | null>(),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  updatedByUserId: text('updated_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('workspace_provider_connection_workspace_provider_unique')
    .on(table.workspaceId, table.provider),
  index('workspace_provider_connection_status_idx').on(table.status),
]);

export const workspaceProviderCredential = pgTable('workspace_provider_credential', {
  id: uuid('id').primaryKey(),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => workspaceProviderConnection.id, { onDelete: 'cascade' }),
  encryptedSecret: text('encrypted_secret').notNull(),
  initializationVector: text('initialization_vector').notNull(),
  authenticationTag: text('authentication_tag').notNull(),
  encryptionKeyVersion: text('encryption_key_version').notNull(),
  fingerprint: text('fingerprint').notNull(),
  maskedLabel: text('masked_label').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('workspace_provider_credential_active_unique')
    .on(table.connectionId)
    .where(sql`${table.revokedAt} is null`),
  index('workspace_provider_credential_connection_created_idx')
    .on(table.connectionId, table.createdAt),
  index('workspace_provider_credential_fingerprint_idx').on(table.fingerprint),
]);

export const workspaceProviderConnectionRelations = relations(
  workspaceProviderConnection,
  ({ many, one }) => ({
    workspace: one(workspace, {
      fields: [workspaceProviderConnection.workspaceId],
      references: [workspace.id],
    }),
    credentials: many(workspaceProviderCredential),
    createdBy: one(user, {
      fields: [workspaceProviderConnection.createdByUserId],
      references: [user.id],
      relationName: 'providerConnectionCreatedBy',
    }),
    updatedBy: one(user, {
      fields: [workspaceProviderConnection.updatedByUserId],
      references: [user.id],
      relationName: 'providerConnectionUpdatedBy',
    }),
  }),
);

export const workspaceProviderCredentialRelations = relations(
  workspaceProviderCredential,
  ({ one }) => ({
    connection: one(workspaceProviderConnection, {
      fields: [workspaceProviderCredential.connectionId],
      references: [workspaceProviderConnection.id],
    }),
    createdBy: one(user, {
      fields: [workspaceProviderCredential.createdByUserId],
      references: [user.id],
    }),
  }),
);
