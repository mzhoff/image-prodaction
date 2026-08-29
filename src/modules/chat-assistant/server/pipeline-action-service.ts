import { and, eq, or, sql } from 'drizzle-orm';
import type { ToolActionProposal, ToolCallRequest, ToolCallResult, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { documentSnapshotHasContent } from '@/entities/document/model/document-lifecycle';
import { getDocument } from '@/entities/document/server/document-service';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import {
  createEmptyProjectUiState,
  createProjectExport,
} from '@/entities/production-graph/model/project-schema';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { getDb } from '@/shared/db/client';
import { document } from '@/shared/db/schema/document';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { PIPELINE_BUILD_PRESENTATION } from '../contracts/image-production-tools';
import {
  applyPipelineBuildPatch,
  parsePipelineBuildInput,
  preparePipelineBuild,
  resolvePipelineDocumentName,
} from '../core/pipeline-build';
import { chatPipelineActionProposal } from './pipeline-action-schema';
import type { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge';
import {
  materializePipelineAttachmentImports,
  resolvePipelineAttachmentImports,
} from './pipeline-attachment-import-service';
import { readVerifiedDocumentContext } from './verified-document-context';

const PROPOSAL_TTL_MS = 10 * 60 * 1_000;

export async function preparePipelineBuildProposal(
  request: ToolCallRequest,
  context: ToolExecutionContext,
  attachmentAssetBridge?: ChatAttachmentAssetBridge,
): Promise<ToolActionProposal> {
  const verified = readVerifiedDocumentContext(context);
  const idempotencyKey = context.idempotencyKey ?? context.toolCallId;
  const existing = await findExistingProposal(context, verified.id, idempotencyKey);
  if (existing) return toToolActionProposal(existing);

  const current = await getDocument(context.userId, verified.id);
  if (current.workspaceId !== context.tenantId || current.status !== 'active') {
    throw new Error('The current document cannot be changed.');
  }
  const parsed = parsePipelineBuildInput(request.input);
  const graph = current.snapshot?.project
    ? structuredClone(current.snapshot.project)
    : structuredClone(initialProject);
  const prepared = preparePipelineBuild(parsed, graph);
  prepared.patch.attachmentImports = await resolvePipelineAttachmentImports(
    prepared.patch.attachmentImports,
    context,
    attachmentAssetBridge,
  );
  prepared.safePreview.nodes = prepared.safePreview.nodes.map((node, index) => ({
    ...node,
    sourceAttachmentName: prepared.patch.attachmentImports.find(
      (item) => item.nodeId === prepared.patch.nodes[index]?.id,
    )?.attachmentName,
  }));
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS);
  const proposalId = createUuidV7();

  await getDb().insert(chatPipelineActionProposal).values({
    id: proposalId,
    documentId: current.id,
    expectedRevision: current.revision,
    expiresAt,
    idempotencyKey,
    patch: prepared.patch,
    safePreview: prepared.safePreview,
    toolCallId: context.toolCallId,
    userId: context.userId,
    workspaceId: current.workspaceId,
  }).onConflictDoNothing();

  const stored = await findExistingProposal(context, verified.id, idempotencyKey);
  if (!stored) throw new Error('The product action proposal could not be stored.');
  return toToolActionProposal(stored);
}

export async function executePipelineBuildProposal(
  request: ToolCallRequest,
  context: ToolExecutionContext,
  attachmentAssetBridge?: ChatAttachmentAssetBridge,
): Promise<ToolCallResult> {
  const verified = readVerifiedDocumentContext(context);
  if (!request.executionRef || !isUuidV7(request.executionRef)) return invalidProposal();

  return getDb().transaction(async (transaction) => {
    const [proposal] = await transaction.select().from(chatPipelineActionProposal).where(and(
      eq(chatPipelineActionProposal.id, request.executionRef!),
      eq(chatPipelineActionProposal.userId, context.userId),
    )).for('update').limit(1);
    if (!proposal || proposal.workspaceId !== context.tenantId || proposal.documentId !== verified.id) {
      return deniedProposal();
    }
    if (proposal.toolCallId !== context.toolCallId
      && proposal.idempotencyKey !== context.idempotencyKey) return deniedProposal();
    if (proposal.status === 'executed' && proposal.safeResult) {
      return { ok: true, output: proposal.safeResult };
    }
    if (proposal.status === 'expired' || proposal.expiresAt.getTime() <= Date.now()) {
      await transaction.update(chatPipelineActionProposal).set({ status: 'expired' })
        .where(eq(chatPipelineActionProposal.id, proposal.id));
      return {
        ok: false,
        safeError: {
          code: 'CHAT_PIPELINE_PROPOSAL_EXPIRED',
          message: 'Предложение устарело. Попросите ассистента подготовить его заново.',
          retryable: true,
        },
      };
    }
    if (proposal.status !== 'prepared') return conflictProposal();
    if (request.concurrencyToken !== createConcurrencyToken(proposal.documentId, proposal.expectedRevision)
      || verified.revision !== proposal.expectedRevision) {
      await markProposalConflict(transaction, proposal.id);
      return conflictProposal();
    }

    const [current] = await transaction.select().from(document)
      .where(and(
        eq(document.id, proposal.documentId),
        eq(document.workspaceId, proposal.workspaceId),
        eq(document.status, 'active'),
      ))
      .for('update')
      .limit(1);
    if (!current) return deniedProposal();
    if (current.revision !== proposal.expectedRevision) {
      await markProposalConflict(transaction, proposal.id);
      return conflictProposal();
    }

    const currentSnapshot = current.snapshot === null
      ? undefined
      : validateDocumentSnapshot(current.snapshot);
    const currentProject = currentSnapshot?.project
      ? structuredClone(currentSnapshot.project)
      : structuredClone(initialProject);
    const materialized = await materializePipelineAttachmentImports(
      proposal.patch.attachmentImports,
      proposal.patch.nodes,
      context,
      proposal.documentId,
      attachmentAssetBridge,
    );
    const materializedPatch = {
      ...proposal.patch,
      assets: materialized.assets,
      nodes: materialized.nodes,
    };
    const nextProject = applyPipelineBuildPatch(currentProject, materializedPatch);
    const nextDocumentName = resolvePipelineDocumentName(current.name, {
      documentName: proposal.patch.documentName || proposal.patch.summary,
      summary: proposal.patch.summary,
    });
    const nextSnapshot = createProjectExport(
      nextProject,
      currentSnapshot?.uiState ?? createEmptyProjectUiState(),
    );
    validateDocumentSnapshot(nextSnapshot);
    const [saved] = await transaction.update(document).set({
      hasEverHadContent: current.hasEverHadContent || documentSnapshotHasContent(nextSnapshot),
      name: nextDocumentName,
      revision: sql`${document.revision} + 1`,
      schemaVersion: nextSnapshot.schemaVersion,
      snapshot: nextSnapshot,
      updatedAt: new Date(),
    }).where(and(
      eq(document.id, proposal.documentId),
      eq(document.revision, proposal.expectedRevision),
    )).returning({ revision: document.revision });
    if (!saved) {
      await markProposalConflict(transaction, proposal.id);
      return conflictProposal();
    }

    const safeResult = {
      action: 'build-pipeline',
      addedEdgeCount: proposal.patch.edges.length,
      addedNodeCount: proposal.patch.nodes.length,
      importedReferenceCount: proposal.patch.attachmentImports.length,
      documentName: nextDocumentName,
      documentId: proposal.documentId,
      revision: saved.revision,
      summary: proposal.patch.summary,
    };
    await transaction.update(chatPipelineActionProposal).set({
      executedAt: new Date(),
      safeResult,
      status: 'executed',
    }).where(eq(chatPipelineActionProposal.id, proposal.id));
    return { ok: true, output: safeResult };
  });
}

async function findExistingProposal(
  context: ToolExecutionContext,
  documentId: string,
  idempotencyKey: string,
) {
  if (!context.tenantId) return undefined;
  const [proposal] = await getDb().select().from(chatPipelineActionProposal).where(and(
    eq(chatPipelineActionProposal.userId, context.userId),
    eq(chatPipelineActionProposal.workspaceId, context.tenantId),
    eq(chatPipelineActionProposal.documentId, documentId),
    or(
      eq(chatPipelineActionProposal.toolCallId, context.toolCallId),
      eq(chatPipelineActionProposal.idempotencyKey, idempotencyKey),
    ),
  )).limit(1);
  return proposal;
}

function toToolActionProposal(proposal: typeof chatPipelineActionProposal.$inferSelect): ToolActionProposal {
  if (proposal.status !== 'prepared' || proposal.expiresAt.getTime() <= Date.now()) {
    throw new Error('The existing product action proposal is no longer active.');
  }
  return {
    concurrencyToken: createConcurrencyToken(proposal.documentId, proposal.expectedRevision),
    executionRef: proposal.id,
    expiresAt: proposal.expiresAt.toISOString(),
    presentationType: PIPELINE_BUILD_PRESENTATION,
    safePreview: proposal.safePreview,
  };
}

function createConcurrencyToken(documentId: string, revision: number) {
  return `document:${documentId}:revision:${revision}`;
}

function invalidProposal(): ToolCallResult {
  return {
    ok: false,
    safeError: {
      code: 'CHAT_PIPELINE_PROPOSAL_INVALID',
      message: 'Подготовленное действие не найдено. Попросите ассистента подготовить его заново.',
      retryable: true,
    },
  };
}

function deniedProposal(): ToolCallResult {
  return {
    ok: false,
    safeError: {
      code: 'CHAT_PIPELINE_ACCESS_DENIED',
      message: 'Нет доступа к выбранному документу.',
      retryable: false,
    },
  };
}

function conflictProposal(): ToolCallResult {
  return {
    ok: false,
    safeError: {
      code: 'CHAT_PIPELINE_CONCURRENCY_CONFLICT',
      message: 'Граф изменился после подготовки. Попросите ассистента обновить план.',
      retryable: true,
    },
  };
}

async function markProposalConflict(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  proposalId: string,
) {
  await transaction.update(chatPipelineActionProposal).set({ status: 'conflict' })
    .where(eq(chatPipelineActionProposal.id, proposalId));
}
