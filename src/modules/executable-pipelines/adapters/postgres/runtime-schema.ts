import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from '@/shared/db/schema/auth';
import { workspace } from '@/shared/db/schema/workspace';
import { executablePipeline, pipelineVersion } from './pipeline-schema';
import type { RuntimeV2CostPolicy, RuntimeV2ExecutionPolicy, RuntimeV2Scope, RuntimeV2UpdatePolicy } from '../../contracts/runtime-v2-contracts';

export const runtimeServiceClient = pgTable('runtime_service_client', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'restrict' }),
  sourceApplication: text('source_application').notNull(),
  externalWorkspaceRef: text('external_workspace_ref').notNull(),
  displayName: text('display_name').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  scopes: jsonb('scopes').$type<RuntimeV2Scope[]>().notNull(),
  grantManagementPolicy: text('grant_management_policy').default('EXPLICIT_SCOPE').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex('runtime_service_client_workspace_application_ref_unique').on(table.workspaceId, table.sourceApplication, table.externalWorkspaceRef),
  index('runtime_service_client_workspace_idx').on(table.workspaceId),
]);

export const runtimeClientCredential = pgTable('runtime_client_credential', {
  id: uuid('id').primaryKey(),
  serviceClientId: uuid('service_client_id').notNull().references(() => runtimeServiceClient.id, { onDelete: 'restrict' }),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  label: text('label').notNull(),
  scopes: jsonb('scopes').$type<RuntimeV2Scope[] | null>(),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('runtime_client_credential_prefix_unique').on(table.tokenPrefix),
  index('runtime_client_credential_client_idx').on(table.serviceClientId),
]);

export const runtimePipelineGrant = pgTable('runtime_pipeline_grant', {
  id: uuid('id').primaryKey(),
  serviceClientId: uuid('service_client_id').notNull().references(() => runtimeServiceClient.id, { onDelete: 'restrict' }),
  pipelineId: uuid('pipeline_id').notNull().references(() => executablePipeline.id, { onDelete: 'restrict' }),
  capabilityKey: text('capability_key').notNull(),
  pinnedVersionId: uuid('pinned_version_id').notNull().references(() => pipelineVersion.id, { onDelete: 'restrict' }),
  pinnedVersion: integer('pinned_version').notNull(),
  pipelineChecksum: text('pipeline_checksum').notNull(),
  inputSchemaChecksum: text('input_schema_checksum').notNull(),
  outputSchemaChecksum: text('output_schema_checksum').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  revision: integer('revision').default(1).notNull(),
  updatePolicy: text('update_policy').$type<RuntimeV2UpdatePolicy>().default('PINNED').notNull(),
  executionPolicy: jsonb('execution_policy').$type<RuntimeV2ExecutionPolicy>().notNull(),
  costPolicy: jsonb('cost_policy').$type<RuntimeV2CostPolicy>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index('runtime_pipeline_grant_client_idx').on(table.serviceClientId)]);

export const runtimeGrantAudit = pgTable('runtime_grant_audit', {
  id: uuid('id').primaryKey(),
  serviceClientId: uuid('service_client_id').notNull().references(() => runtimeServiceClient.id, { onDelete: 'restrict' }),
  grantId: uuid('grant_id').references(() => runtimePipelineGrant.id, { onDelete: 'restrict' }),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  before: jsonb('before').$type<Record<string, unknown> | null>(),
  after: jsonb('after').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('runtime_grant_audit_client_created_idx').on(table.serviceClientId, table.createdAt)]);
