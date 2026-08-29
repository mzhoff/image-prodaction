import { and, eq, or, sql } from 'drizzle-orm';
import type { ToolActionProposal, ToolCallRequest, ToolCallResult, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { documentSnapshotHasContent } from '@/entities/document/model/document-lifecycle';
import { getDocument } from '@/entities/document/server/document-service';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '@/entities/production-graph/model/project-schema';
import { getDb } from '@/shared/db/client';
import { document } from '@/shared/db/schema/document';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { PIPELINE_UPDATE_PRESENTATION } from '../contracts/image-production-tools';
import {
  applyPipelineUpdatePatch,
  pipelineUpdateInputSchema,
  preparePipelineUpdate,
} from '../core/pipeline-update';
import { chatPipelineUpdateProposal } from './pipeline-update-schema';
import type { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge';
import {
  materializePipelineAttachmentImports,
  resolvePipelineAttachmentImports,
} from './pipeline-attachment-import-service';
import { readVerifiedDocumentContext } from './verified-document-context';

const PROPOSAL_TTL_MS = 10 * 60 * 1_000;

export async function preparePipelineUpdateProposal(
  request: ToolCallRequest,
  context: ToolExecutionContext,
  attachmentAssetBridge?: ChatAttachmentAssetBridge,
) {
  const verified = readVerifiedDocumentContext(context);
  const idempotencyKey = context.idempotencyKey ?? context.toolCallId;
  const existing = await findProposal(context, verified.id, idempotencyKey);
  if (existing) return toActionProposal(existing);
  const current = await getDocument(context.userId, verified.id);
  if (current.workspaceId !== context.tenantId || current.status !== 'active') {
    throw new Error('The current document cannot be changed.');
  }
  const graph = current.snapshot?.project ? structuredClone(current.snapshot.project) : structuredClone(initialProject);
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse(request.input), graph);
  prepared.patch.attachmentImports = await resolvePipelineAttachmentImports(
    prepared.patch.attachmentImports,
    context,
    attachmentAssetBridge,
  );
  await getDb().insert(chatPipelineUpdateProposal).values({
    id: createUuidV7(),
    documentId: current.id,
    expectedRevision: current.revision,
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    idempotencyKey,
    patch: prepared.patch,
    safePreview: prepared.safePreview,
    toolCallId: context.toolCallId,
    userId: context.userId,
    workspaceId: current.workspaceId,
  }).onConflictDoNothing();
  const stored = await findProposal(context, verified.id, idempotencyKey);
  if (!stored) throw new Error('The product update proposal could not be stored.');
  return toActionProposal(stored);
}

export async function executePipelineUpdateProposal(
  request: ToolCallRequest,
  context: ToolExecutionContext,
  attachmentAssetBridge?: ChatAttachmentAssetBridge,
): Promise<ToolCallResult> {
  const verified = readVerifiedDocumentContext(context);
  if (!request.executionRef || !isUuidV7(request.executionRef)) return invalidProposal();
  return getDb().transaction(async (transaction) => {
    const [proposal] = await transaction.select().from(chatPipelineUpdateProposal).where(and(
      eq(chatPipelineUpdateProposal.id, request.executionRef!),
      eq(chatPipelineUpdateProposal.userId, context.userId),
    )).for('update').limit(1);
    if (!proposal || proposal.workspaceId !== context.tenantId || proposal.documentId !== verified.id) {
      return deniedProposal();
    }
    if (proposal.toolCallId !== context.toolCallId && proposal.idempotencyKey !== context.idempotencyKey) {
      return deniedProposal();
    }
    if (proposal.status === 'executed' && proposal.safeResult) return { ok: true, output: proposal.safeResult };
    if (proposal.status === 'expired' || proposal.expiresAt.getTime() <= Date.now()) {
      await transaction.update(chatPipelineUpdateProposal).set({ status: 'expired' })
        .where(eq(chatPipelineUpdateProposal.id, proposal.id));
      return expiredProposal();
    }
    if (proposal.status !== 'prepared'
      || request.concurrencyToken !== concurrencyToken(proposal.documentId, proposal.expectedRevision)
      || verified.revision !== proposal.expectedRevision) {
      await markConflict(transaction, proposal.id);
      return conflictProposal();
    }
    const [current] = await transaction.select().from(document).where(and(
      eq(document.id, proposal.documentId),
      eq(document.workspaceId, proposal.workspaceId),
      eq(document.status, 'active'),
    )).for('update').limit(1);
    if (!current) return deniedProposal();
    if (current.revision !== proposal.expectedRevision) {
      await markConflict(transaction, proposal.id);
      return conflictProposal();
    }
    const snapshot = current.snapshot === null ? undefined : validateDocumentSnapshot(current.snapshot);
    const project = snapshot?.project ? structuredClone(snapshot.project) : structuredClone(initialProject);
    const materialized = await materializePipelineAttachmentImports(
      proposal.patch.attachmentImports,
      proposal.patch.addedNodes,
      context,
      proposal.documentId,
      attachmentAssetBridge,
    );
    const materializedPatch = {
      ...proposal.patch,
      addedNodes: materialized.nodes,
      assets: materialized.assets,
    };
    const nextProject = applyPipelineUpdatePatch(project, materializedPatch);
    const nextSnapshot = createProjectExport(nextProject, snapshot?.uiState ?? createEmptyProjectUiState());
    validateDocumentSnapshot(nextSnapshot);
    const [saved] = await transaction.update(document).set({
      hasEverHadContent: current.hasEverHadContent || documentSnapshotHasContent(nextSnapshot),
      revision: sql`${document.revision} + 1`,
      schemaVersion: nextSnapshot.schemaVersion,
      snapshot: nextSnapshot,
      updatedAt: new Date(),
    }).where(and(eq(document.id, proposal.documentId), eq(document.revision, proposal.expectedRevision)))
      .returning({ revision: document.revision });
    if (!saved) {
      await markConflict(transaction, proposal.id);
      return conflictProposal();
    }
    const safeResult = {
      action: 'update-pipeline',
      addedEdgeCount: proposal.patch.addedEdges.length,
      addedNodeCount: proposal.patch.addedNodes.length,
      importedReferenceCount: proposal.patch.attachmentImports.length,
      documentId: proposal.documentId,
      movedNodeCount: proposal.patch.movedNodes?.length ?? 0,
      removedEdgeCount: proposal.patch.removeEdgeIds.length,
      revision: saved.revision,
      summary: proposal.patch.summary,
      updatedNodeCount: proposal.patch.updatedNodes.length,
    };
    await transaction.update(chatPipelineUpdateProposal).set({
      executedAt: new Date(), safeResult, status: 'executed',
    }).where(eq(chatPipelineUpdateProposal.id, proposal.id));
    return { ok: true, output: safeResult };
  });
}

async function findProposal(context: ToolExecutionContext, documentId: string, idempotencyKey: string) {
  if (!context.tenantId) return undefined;
  const [proposal] = await getDb().select().from(chatPipelineUpdateProposal).where(and(
    eq(chatPipelineUpdateProposal.userId, context.userId),
    eq(chatPipelineUpdateProposal.workspaceId, context.tenantId),
    eq(chatPipelineUpdateProposal.documentId, documentId),
    or(
      eq(chatPipelineUpdateProposal.toolCallId, context.toolCallId),
      eq(chatPipelineUpdateProposal.idempotencyKey, idempotencyKey),
    ),
  )).limit(1);
  return proposal;
}

function toActionProposal(row: typeof chatPipelineUpdateProposal.$inferSelect): ToolActionProposal {
  if (row.status !== 'prepared' || row.expiresAt.getTime() <= Date.now()) {
    throw new Error('The existing update proposal is no longer active.');
  }
  return {
    concurrencyToken: concurrencyToken(row.documentId, row.expectedRevision),
    executionRef: row.id,
    expiresAt: row.expiresAt.toISOString(),
    presentationType: PIPELINE_UPDATE_PRESENTATION,
    safePreview: row.safePreview,
  };
}

function concurrencyToken(documentId: string, revision: number) {
  return `document:${documentId}:revision:${revision}`;
}

function invalidProposal(): ToolCallResult { return failure('CHAT_PIPELINE_UPDATE_INVALID', 'Изменение не найдено. Подготовьте его заново.', true); }
function deniedProposal(): ToolCallResult { return failure('CHAT_PIPELINE_ACCESS_DENIED', 'Нет доступа к выбранному документу.', false); }
function expiredProposal(): ToolCallResult { return failure('CHAT_PIPELINE_UPDATE_EXPIRED', 'Предложение устарело. Подготовьте его заново.', true); }
function conflictProposal(): ToolCallResult { return failure('CHAT_PIPELINE_CONCURRENCY_CONFLICT', 'Граф изменился после подготовки. Обновите план.', true); }
function failure(code: string, message: string, retryable: boolean): ToolCallResult {
  return { ok: false, safeError: { code, message, retryable } };
}

async function markConflict(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  proposalId: string,
) {
  await transaction.update(chatPipelineUpdateProposal).set({ status: 'conflict' })
    .where(eq(chatPipelineUpdateProposal.id, proposalId));
}
