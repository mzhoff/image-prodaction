import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  CompiledPipelinePlan,
  PipelineInputs,
  PipelineRunCompletion,
} from '../../contracts/pipeline-contracts';
import { user } from '@/shared/db/schema/auth';
import { document } from '@/shared/db/schema/document';
import { workspace } from '@/shared/db/schema/workspace';

export const executablePipelineStatus = pgEnum('executable_pipeline_status', [
  'draft',
  'active',
  'paused',
  'deprecated',
]);

export const pipelineRunStatus = pgEnum('pipeline_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const pipelineNodeRunStatus = pgEnum('pipeline_node_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'canceled',
]);

export const executablePipeline = pgTable('executable_pipeline', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  originDocumentId: uuid('origin_document_id')
    .references(() => document.id, { onDelete: 'set null' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  status: executablePipelineStatus('status').default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  index('executable_pipeline_workspace_status_idx').on(
    table.workspaceId,
    table.status,
    table.updatedAt,
  ),
  index('executable_pipeline_origin_document_idx').on(table.originDocumentId),
]);

export const pipelineVersion = pgTable('pipeline_version', {
  id: uuid('id').primaryKey(),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => executablePipeline.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  compiledPlan: jsonb('compiled_plan').$type<CompiledPipelinePlan>().notNull(),
  checksum: text('checksum').notNull(),
  publishedByUserId: text('published_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('pipeline_version_pipeline_version_unique').on(
    table.pipelineId,
    table.version,
  ),
  index('pipeline_version_pipeline_published_idx').on(
    table.pipelineId,
    table.publishedAt,
  ),
]);

export const pipelineEndpoint = pgTable('pipeline_endpoint', {
  id: uuid('id').primaryKey(),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => executablePipeline.id, { onDelete: 'cascade' }),
  activeVersionId: uuid('active_version_id')
    .notNull()
    .references(() => pipelineVersion.id, { onDelete: 'restrict' }),
  publicId: text('public_id').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  authPolicy: jsonb('auth_policy').$type<Record<string, unknown>>().notNull(),
  executionPolicy: jsonb('execution_policy').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('pipeline_endpoint_pipeline_unique').on(table.pipelineId),
  uniqueIndex('pipeline_endpoint_public_id_unique').on(table.publicId),
]);

export const pipelineRun = pgTable('pipeline_run', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => executablePipeline.id, { onDelete: 'restrict' }),
  pipelineVersionId: uuid('pipeline_version_id')
    .notNull()
    .references(() => pipelineVersion.id, { onDelete: 'restrict' }),
  pipelineVersion: integer('pipeline_version').notNull(),
  sourceApplication: text('source_application').notNull(),
  initiatorType: text('initiator_type').default('service').notNull(),
  initiatorId: text('initiator_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  inputPayload: jsonb('input_payload').$type<PipelineInputs>().notNull(),
  resultPayload: jsonb('result_payload').$type<PipelineRunCompletion | null>(),
  inputObjectKey: text('input_object_key'),
  resultObjectKey: text('result_object_key'),
  status: pipelineRunStatus('status').default('queued').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  retryable: boolean('retryable'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 20, scale: 8 }),
  actualCostUsd: numeric('actual_cost_usd', { precision: 20, scale: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  retryAvailableAt: timestamp('retry_available_at', { withTimezone: true }),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('pipeline_run_workspace_idempotency_unique').on(
    table.workspaceId,
    table.idempotencyKey,
  ),
  index('pipeline_run_claim_idx').on(
    table.status,
    table.retryAvailableAt,
    table.leaseExpiresAt,
    table.enqueuedAt,
  ),
  index('pipeline_run_pipeline_created_idx').on(
    table.pipelineId,
    table.createdAt,
  ),
  index('pipeline_run_workspace_created_idx').on(
    table.workspaceId,
    table.createdAt,
  ),
  index('pipeline_run_source_created_idx').on(
    table.sourceApplication,
    table.createdAt,
  ),
]);

export const pipelineNodeRun = pgTable('pipeline_node_run', {
  id: uuid('id').primaryKey(),
  pipelineRunId: uuid('pipeline_run_id')
    .notNull()
    .references(() => pipelineRun.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  handlerType: text('handler_type').notNull(),
  handlerVersion: text('handler_version').notNull(),
  status: pipelineNodeRunStatus('status').default('queued').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  inputHash: text('input_hash'),
  outputObjectKey: text('output_object_key'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('pipeline_node_run_attempt_unique').on(
    table.pipelineRunId,
    table.nodeId,
    table.attemptCount,
  ),
  index('pipeline_node_run_run_status_idx').on(
    table.pipelineRunId,
    table.status,
  ),
]);
