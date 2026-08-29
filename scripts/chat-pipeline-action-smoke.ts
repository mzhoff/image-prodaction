import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import {
  createDocument,
  getDocument,
  permanentlyDeleteDocument,
  saveDocumentSnapshot,
  updateDocumentMetadata,
} from '@/entities/document/server/document-service';
import {
  PIPELINE_BUILD_TOOL,
  PIPELINE_UPDATE_TOOL,
} from '@/modules/chat-assistant/contracts/image-production-tools';
import {
  executePipelineBuildProposal,
  preparePipelineBuildProposal,
} from '@/modules/chat-assistant/server/pipeline-action-service';
import {
  executePipelineUpdateProposal,
  preparePipelineUpdateProposal,
} from '@/modules/chat-assistant/server/pipeline-update-service';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';

config({ path: '.env.local' });
config({ path: '.env' });

const runId = createUuidV7();
const userId = `chat-pipeline-smoke-${runId}`;
const workspaceId = createUuidV7();
const conversationId = createUuidV7();
const actor = { userId, workspaceId };
let createdDocument: Awaited<ReturnType<typeof createDocument>> | undefined;

try {
  await seedActor();
  const created = await createDocument({
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  createdDocument = created;

  const request = {
    input: {
      documentName: 'Chat pipeline smoke',
      summary: 'Create an initial Telegram post pipeline.',
      nodes: [
        { key: 'notes', type: 'textPrompt', settings: { text: 'Draft notes' } },
        { key: 'generation', type: 'textGeneration', settings: { instruction: 'All rules mixed together.' } },
        { key: 'formatter', type: 'textFormatter', settings: { presetId: 'telegram-post' } },
      ],
      edges: [
        { sourceNodeKey: 'notes', sourcePortId: 'text', targetNodeKey: 'generation', targetPortId: 'text' },
        { sourceNodeKey: 'generation', sourcePortId: 'result', targetNodeKey: 'formatter', targetPortId: 'text' },
      ],
    },
    riskLevel: 'write' as const,
    toolName: PIPELINE_BUILD_TOOL,
  };
  const context = createContext({
    documentId: created.id,
    revision: created.revision,
    toolCallId: createToolCallId('success'),
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  const proposal = await preparePipelineBuildProposal(request, context);
  assert.equal(proposal.presentationType, 'image-production.pipeline-build');
  assert.equal(proposal.safePreview.addedNodeCount, 3);

  const executed = await executePipelineBuildProposal({
    ...request,
    concurrencyToken: proposal.concurrencyToken,
    executionRef: proposal.executionRef,
  }, context);
  assert.equal(executed.ok, true);
  const afterExecution = await getDocument(actor.userId, created.id);
  assert.equal(afterExecution.revision, 1);
  assert.equal(afterExecution.name, 'Chat pipeline smoke');
  assert.equal(afterExecution.snapshot?.project.nodes.length, 3);
  assert.equal(afterExecution.snapshot?.project.edges.length, 2);

  const repeated = await executePipelineBuildProposal({
    ...request,
    concurrencyToken: proposal.concurrencyToken,
    executionRef: proposal.executionRef,
  }, context);
  assert.deepEqual(repeated, executed);
  assert.equal((await getDocument(actor.userId, created.id)).revision, 1);

  const notes = afterExecution.snapshot!.project.nodes.find((node) => node.type === 'textPrompt')!;
  const generation = afterExecution.snapshot!.project.nodes.find((node) => node.type === 'textGeneration')!;
  const promptEdge = afterExecution.snapshot!.project.edges.find((edge) => edge.targetNodeId === generation.id)!;
  const updateRequest = {
    input: {
      summary: 'Separate notes, formatting rules and style before generation.',
      nodes: [
        { key: 'rules', type: 'textPrompt', settings: { title: 'Formatting rules' } },
        { key: 'style', type: 'textPrompt', settings: { title: 'Style and tone' } },
        { key: 'concat', type: 'textConcat', settings: { separator: 'double-newline', title: 'Prompt assembly' } },
      ],
      updates: [{
        nodeId: generation.id,
        settings: { instruction: 'Generate a Telegram post from the connected structured prompt.' },
      }],
      removeEdgeIds: [promptEdge.id],
      edges: [
        { sourceNodeRef: notes.id, sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-0' },
        { sourceNodeRef: 'rules', sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-1' },
        { sourceNodeRef: 'style', sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-2' },
        { sourceNodeRef: 'concat', sourcePortId: 'result', targetNodeRef: generation.id, targetPortId: 'text' },
      ],
    },
    riskLevel: 'write' as const,
    toolName: PIPELINE_UPDATE_TOOL,
  };
  const updateContext = createContext({
    documentId: created.id,
    revision: afterExecution.revision,
    toolCallId: createToolCallId('update'),
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  const updateProposal = await preparePipelineUpdateProposal(updateRequest, updateContext);
  assert.equal(updateProposal.presentationType, 'image-production.pipeline-update');
  assert.equal(updateProposal.safePreview.addedNodeCount, 3);
  assert.equal(updateProposal.safePreview.updatedNodeCount, 1);

  const updateExecuted = await executePipelineUpdateProposal({
    ...updateRequest,
    concurrencyToken: updateProposal.concurrencyToken,
    executionRef: updateProposal.executionRef,
  }, updateContext);
  assert.equal(updateExecuted.ok, true);
  const afterUpdate = await getDocument(actor.userId, created.id);
  assert.equal(afterUpdate.revision, 2);
  assert.equal(afterUpdate.snapshot?.project.nodes.length, 6);
  assert.equal(afterUpdate.snapshot?.project.edges.length, 5);
  const concat = afterUpdate.snapshot?.project.nodes.find((node) => node.type === 'textConcat');
  assert.equal(concat && 'inputCount' in concat.data ? concat.data.inputCount : undefined, 3);

  const updateRepeated = await executePipelineUpdateProposal({
    ...updateRequest,
    concurrencyToken: updateProposal.concurrencyToken,
    executionRef: updateProposal.executionRef,
  }, updateContext);
  assert.deepEqual(updateRepeated, updateExecuted);
  assert.equal((await getDocument(actor.userId, created.id)).revision, 2);

  const rules = afterUpdate.snapshot!.project.nodes.find((node) => node.data.title === 'Formatting rules')!;
  const style = afterUpdate.snapshot!.project.nodes.find((node) => node.data.title === 'Style and tone')!;
  const templateRequest = {
    input: {
      summary: 'Replace concat output with a text prompt template.',
      nodes: [{
        key: 'template',
        type: 'textPrompt',
        settings: {
          text: '@Notes\n\n@Rules\n\n@Style',
          title: 'Prompt template',
          variables: [
            { id: 'variable-0', alias: 'Notes' },
            { id: 'variable-1', alias: 'Rules' },
            { id: 'variable-2', alias: 'Style' },
          ],
        },
      }],
      edges: [
        { sourceNodeRef: notes.id, sourcePortId: 'text', targetNodeRef: 'template', targetPortId: 'text-0' },
        { sourceNodeRef: rules.id, sourcePortId: 'text', targetNodeRef: 'template', targetPortId: 'text-1' },
        { sourceNodeRef: style.id, sourcePortId: 'text', targetNodeRef: 'template', targetPortId: 'text-2' },
        { sourceNodeRef: 'template', sourcePortId: 'text', targetNodeRef: generation.id, targetPortId: 'text' },
      ],
    },
    riskLevel: 'write' as const,
    toolName: PIPELINE_UPDATE_TOOL,
  };
  const templateContext = createContext({
    documentId: created.id,
    revision: afterUpdate.revision,
    toolCallId: createToolCallId('template-update'),
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  const templateProposal = await preparePipelineUpdateProposal(templateRequest, templateContext);
  assert.equal(templateProposal.safePreview.removedEdgeCount, 1);
  assert.match(String(templateProposal.safePreview.warnings), /будет заменена/u);
  const templateExecuted = await executePipelineUpdateProposal({
    ...templateRequest,
    concurrencyToken: templateProposal.concurrencyToken,
    executionRef: templateProposal.executionRef,
  }, templateContext);
  assert.equal(templateExecuted.ok, true);
  const afterTemplateUpdate = await getDocument(actor.userId, created.id);
  const template = afterTemplateUpdate.snapshot!.project.nodes.find((node) => node.data.title === 'Prompt template')!;
  assert.equal(afterTemplateUpdate.revision, 3);
  assert.deepEqual(
    afterTemplateUpdate.snapshot!.project.edges
      .filter((edge) => edge.targetNodeId === template.id)
      .map((edge) => edge.targetPortId),
    ['variable-0', 'variable-1', 'variable-2'],
  );
  assert.equal(afterTemplateUpdate.snapshot!.project.edges.some((edge) => (
    edge.sourceNodeId === template.id
    && edge.targetNodeId === generation.id
    && edge.targetPortId === 'text'
  )), true);

  const staleSelectorRevision = afterTemplateUpdate.revision;
  const unsavedContext = createContext({
    documentId: created.id,
    revision: staleSelectorRevision,
    selectorHasUnsavedChanges: true,
    selectorRevisionMatches: false,
    toolCallId: createToolCallId('unsaved'),
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  await assert.rejects(
    () => preparePipelineBuildProposal({
      ...request,
      input: {
        documentName: 'Must not be prepared from unsaved canvas',
        summary: 'Reject a proposal while browser-only graph changes exist.',
        nodes: [{ key: 'unsaved-export', type: 'exportImage' }],
        edges: [],
      },
    }, unsavedContext),
    /verified document context/u,
  );
  assert.equal((await getDocument(actor.userId, created.id)).revision, staleSelectorRevision);
  await saveDocumentSnapshot({
    documentId: created.id,
    expectedRevision: staleSelectorRevision,
    snapshot: afterTemplateUpdate.snapshot,
    userId: actor.userId,
  });
  const afterAutosave = await getDocument(actor.userId, created.id);
  const conflictContext = createContext({
    documentId: created.id,
    revision: afterAutosave.revision,
    selectorRevisionMatches: false,
    toolCallId: createToolCallId('conflict'),
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
  const conflictProposal = await preparePipelineBuildProposal({
    ...request,
    input: {
      documentName: 'Chat pipeline smoke conflict',
      summary: 'Add an export node after the graph changes.',
      nodes: [{ key: 'export', type: 'exportImage' }],
      edges: [],
    },
  }, conflictContext);
  assert.equal(
    conflictProposal.concurrencyToken,
    `document:${created.id}:revision:${afterAutosave.revision}`,
  );
  await saveDocumentSnapshot({
    documentId: created.id,
    expectedRevision: afterAutosave.revision,
    snapshot: afterTemplateUpdate.snapshot,
    userId: actor.userId,
  });
  const latest = await getDocument(actor.userId, created.id);
  const conflicted = await executePipelineBuildProposal({
    ...request,
    concurrencyToken: conflictProposal.concurrencyToken,
    executionRef: conflictProposal.executionRef,
  }, {
    ...conflictContext,
    verifiedContext: {
      document: {
        id: created.id,
        revision: latest.revision,
        selectorRevisionMatches: false,
      },
    },
  });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.safeError?.code, 'CHAT_PIPELINE_CONCURRENCY_CONFLICT');
  assert.equal((await getDocument(actor.userId, created.id)).snapshot?.project.nodes.length, 7);

  console.info('chat pipeline action smoke passed: build/update/template replacement + stale selector rebase + confirm + once-only execution + revision conflict');
} finally {
  if (createdDocument) {
    await updateDocumentMetadata({
      documentId: createdDocument.id,
      status: 'trash',
      userId: actor.userId,
    }).catch(() => undefined);
    await permanentlyDeleteDocument(actor.userId, createdDocument.id).catch(() => undefined);
  }
  await getDb().delete(workspace).where(eq(workspace.id, workspaceId)).catch(() => undefined);
  await getDb().delete(user).where(eq(user.id, userId)).catch(() => undefined);
  await getPostgresPool().end();
}

async function seedActor() {
  const now = new Date();
  await getDb().insert(user).values({
    id: userId,
    name: 'Chat Pipeline Smoke User',
    email: `${userId}@example.test`,
    emailVerified: true,
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
  });
  await getDb().insert(workspace).values({
    id: workspaceId,
    name: 'Chat pipeline smoke workspace',
    kind: 'personal',
    createdByUserId: userId,
  });
  await getDb().insert(membership).values({
    workspaceId,
    userId,
    role: 'owner',
  });
}

function createToolCallId(suffix: string) {
  return `tool-${runId}-${suffix}`;
}

function createContext(input: {
  documentId: string;
  revision: number;
  selectorHasUnsavedChanges?: boolean;
  selectorRevisionMatches?: boolean;
  toolCallId: string;
  userId: string;
  workspaceId: string;
}) {
  return {
    conversationId,
    idempotencyKey: input.toolCallId,
    productId: 'image-production',
    tenantId: input.workspaceId,
    toolCallId: input.toolCallId,
    userId: input.userId,
    verifiedContext: {
      document: {
        id: input.documentId,
        revision: input.revision,
        selectorHasUnsavedChanges: input.selectorHasUnsavedChanges ?? false,
        selectorRevisionMatches: input.selectorRevisionMatches ?? true,
      },
    },
  };
}
