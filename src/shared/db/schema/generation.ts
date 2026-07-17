import { relations } from 'drizzle-orm';
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
import { asset } from './asset';
import { user } from './auth';
import { document } from './document';
import { workspace } from './workspace';

export const generationJobStatus = pgEnum('generation_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

/**
 * Durable orchestration and usage ledger.
 *
 * Monetary values and internal credits are exact decimal strings at the service
 * boundary. There is intentionally no tariff or wallet calculation here yet.
 */
export const generationJob = pgTable('generation_job', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .references(() => document.id, { onDelete: 'set null' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  operation: text('operation').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  requestObjectKey: text('request_object_key'),
  resultObjectKey: text('result_object_key'),
  providerOperationId: text('provider_operation_id'),
  providerDispatchedAt: timestamp('provider_dispatched_at', { withTimezone: true }),
  providerDispatchedAttempt: integer('provider_dispatched_attempt'),
  queueJobId: text('queue_job_id'),
  status: generationJobStatus('status').default('queued').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  inputTokens: numeric('input_tokens', { precision: 20, scale: 0 }),
  outputTokens: numeric('output_tokens', { precision: 20, scale: 0 }),
  totalTokens: numeric('total_tokens', { precision: 20, scale: 0 }),
  providerCostUsd: numeric('provider_cost_usd', { precision: 20, scale: 8 }),
  internalCreditsCharged: numeric('internal_credits_charged', { precision: 20, scale: 8 }),
  internalCreditsBalanceAfter: numeric('internal_credits_balance_after', { precision: 20, scale: 8 }),
  usageComplete: boolean('usage_complete').default(false).notNull(),
  finalAssetId: uuid('final_asset_id')
    .references(() => asset.id, { onDelete: 'set null' }),
  retryable: boolean('retryable'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
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
  uniqueIndex('generation_job_workspace_idempotency_unique').on(
    table.workspaceId,
    table.idempotencyKey,
  ),
  index('generation_job_workspace_status_created_idx').on(
    table.workspaceId,
    table.status,
    table.createdAt,
  ),
  index('generation_job_creator_created_idx').on(table.createdByUserId, table.createdAt),
  index('generation_job_document_idx').on(table.documentId),
  index('generation_job_lease_idx').on(table.status, table.leaseExpiresAt),
  index('generation_job_retry_idx').on(table.status, table.retryAvailableAt),
  index('generation_job_dispatch_idx').on(table.status, table.enqueuedAt, table.createdAt),
  index('generation_job_final_asset_idx').on(table.finalAssetId),
  index('generation_job_provider_operation_idx').on(table.provider, table.providerOperationId),
]);

export const generationJobRelations = relations(generationJob, ({ one }) => ({
  creator: one(user, {
    fields: [generationJob.createdByUserId],
    references: [user.id],
  }),
  document: one(document, {
    fields: [generationJob.documentId],
    references: [document.id],
  }),
  finalAsset: one(asset, {
    fields: [generationJob.finalAssetId],
    references: [asset.id],
  }),
  workspace: one(workspace, {
    fields: [generationJob.workspaceId],
    references: [workspace.id],
  }),
}));
