import { index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { generationJob } from '@/shared/db/schema/generation';
import { pipelineRun } from './pipeline-schema';

/** Dispatch reservations, not a billing ledger. Actual immutable usage remains in usage_event. */
export const runtimeCostReservation = pgTable('runtime_cost_reservation', {
  id: uuid('id').primaryKey(),
  pipelineRunId: uuid('pipeline_run_id').notNull().references(() => pipelineRun.id, { onDelete: 'restrict' }),
  generationJobId: uuid('generation_job_id').notNull().references(() => generationJob.id, { onDelete: 'restrict' }),
  attemptCount: integer('attempt_count').notNull(),
  reservedCostUsd: numeric('reserved_cost_usd', { precision: 20, scale: 8 }),
  actualCostUsd: numeric('actual_cost_usd', { precision: 20, scale: 8 }),
  pricingSnapshotId: text('pricing_snapshot_id'),
  state: text('state').$type<'DISPATCHED' | 'SETTLED'>().notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('runtime_cost_reservation_call_unique').on(table.generationJobId, table.attemptCount),
  index('runtime_cost_reservation_run_idx').on(table.pipelineRunId),
]);
