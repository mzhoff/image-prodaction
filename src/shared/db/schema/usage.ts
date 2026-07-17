import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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

/**
 * Append-only accounting event for one physical provider call.
 *
 * generation_job is the product state shown to the user; usage_event is the
 * audit trail used for provider cost and future internal credit accounting.
 */
export const usageEvent = pgTable('usage_event', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .references(() => document.id, { onDelete: 'set null' }),
  generationJobId: uuid('generation_job_id')
    .notNull()
    .references(() => generationJob.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  provider: text('provider').notNull(),
  providerOperationId: text('provider_operation_id'),
  modelId: text('model_id').notNull(),
  operation: text('operation').notNull(),
  attemptCount: integer('attempt_count').notNull(),
  callIndex: integer('call_index').default(0).notNull(),
  succeeded: boolean('succeeded').notNull(),
  usageComplete: boolean('usage_complete').default(false).notNull(),
  inputTokens: numeric('input_tokens', { precision: 20, scale: 0 }),
  outputTokens: numeric('output_tokens', { precision: 20, scale: 0 }),
  totalTokens: numeric('total_tokens', { precision: 20, scale: 0 }),
  providerCostUsd: numeric('provider_cost_usd', { precision: 20, scale: 8 }),
  internalCreditsCharged: numeric('internal_credits_charged', { precision: 20, scale: 8 }),
  internalCreditsBalanceAfter: numeric('internal_credits_balance_after', { precision: 20, scale: 8 }),
  errorCode: text('error_code'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('usage_event_job_attempt_call_unique')
    .on(table.generationJobId, table.attemptCount, table.callIndex),
  index('usage_event_workspace_occurred_idx').on(table.workspaceId, table.occurredAt),
  index('usage_event_workspace_model_idx').on(table.workspaceId, table.modelId),
  index('usage_event_workspace_operation_idx').on(table.workspaceId, table.operation),
  index('usage_event_provider_operation_idx').on(table.provider, table.providerOperationId),
]);

export const usageEventRelations = relations(usageEvent, ({ one }) => ({
  creator: one(user, {
    fields: [usageEvent.createdByUserId],
    references: [user.id],
  }),
  document: one(document, {
    fields: [usageEvent.documentId],
    references: [document.id],
  }),
  generationJob: one(generationJob, {
    fields: [usageEvent.generationJobId],
    references: [generationJob.id],
  }),
  workspace: one(workspace, {
    fields: [usageEvent.workspaceId],
    references: [workspace.id],
  }),
}));
