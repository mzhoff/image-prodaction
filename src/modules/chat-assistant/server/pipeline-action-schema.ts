import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PreparedPipelineBuildPatch, PipelineBuildSafePreview } from '../core/pipeline-build';
import { user } from '@/shared/db/schema/auth';
import { document } from '@/shared/db/schema/document';
import { workspace } from '@/shared/db/schema/workspace';

export type PipelineActionProposalStatus = 'prepared' | 'executed' | 'conflict' | 'expired';

export const chatPipelineActionProposal = pgTable('chat_pipeline_action_proposal', {
  id: uuid('id').primaryKey(),
  toolCallId: text('tool_call_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => document.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expectedRevision: integer('expected_revision').notNull(),
  status: text('status').$type<PipelineActionProposalStatus>().default('prepared').notNull(),
  patch: jsonb('patch').$type<PreparedPipelineBuildPatch>().notNull(),
  safePreview: jsonb('safe_preview').$type<PipelineBuildSafePreview>().notNull(),
  safeResult: jsonb('safe_result').$type<Record<string, unknown> | null>(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('chat_pipeline_action_proposal_tool_call_key').on(table.toolCallId),
  uniqueIndex('chat_pipeline_action_proposal_idempotency_key').on(
    table.documentId,
    table.userId,
    table.idempotencyKey,
  ),
  index('chat_pipeline_action_proposal_document_idx').on(table.documentId, table.createdAt),
  index('chat_pipeline_action_proposal_expiry_idx').on(table.status, table.expiresAt),
]);
