import { and, asc, eq } from 'drizzle-orm';
import { getDocument } from '@/entities/document/server/document-service';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { documentAssistantEvent } from '@/shared/db/schema/document-assistant-event';
import { isUuid } from '@/shared/lib/id';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import type { DocumentAssistantActivity, DocumentAssistantEventKind } from '../contracts/document-assistant-activity';
import { DocumentConversationAccessError, ensureDocumentConversation } from './document-conversation-service';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { persistDocumentActivityMessages } from './document-activity-chat-adapter';
import { createDocumentActivityId, insertDocumentActivityOnce } from './document-activity-identity';

export type { DocumentAssistantActivity, DocumentAssistantEventKind } from '../contracts/document-assistant-activity';

interface Principal { productId: string; tenantId?: string; userId: string }

export async function listDocumentAssistantActivity(principal: Principal, documentId: string) {
  const workspaceId = await requireDocumentScope(principal, documentId);
  const rows = await getDb().select().from(documentAssistantEvent).where(and(
    eq(documentAssistantEvent.documentId, documentId),
    eq(documentAssistantEvent.workspaceId, workspaceId),
    eq(documentAssistantEvent.userId, principal.userId),
  )).orderBy(asc(documentAssistantEvent.createdAt), asc(documentAssistantEvent.id));
  const activities = rows.map(toActivity);
  await persistActivities(principal, documentId, activities);
  return activities;
}

export async function recordDocumentAssistantActivity(principal: Principal, input: {
  documentId: string;
  kind: DocumentAssistantEventKind;
  nodeId: string;
  model?: string;
  assetId?: string;
}) {
  const workspaceId = await requireDocumentScope(principal, input.documentId);
  const assetId = input.assetId?.toLowerCase();
  if (assetId !== undefined) {
    if (!isUuid(assetId)) throw new DocumentConversationAccessError();
    const [available] = await getDb().select({ id: asset.id }).from(asset).where(and(
      eq(asset.id, assetId), eq(asset.workspaceId, workspaceId), eq(asset.documentId, input.documentId),
      eq(asset.status, 'ready'), eq(asset.mediaKind, input.kind === 'video-generated' ? 'video' : 'image'),
    )).limit(1);
    if (!available) throw new DocumentConversationAccessError();
  }
  const id = createDocumentActivityId({ ...input, assetId, workspaceId, productId: principal.productId, userId: principal.userId });
  const values = {
    id,
    documentId: input.documentId,
    workspaceId,
    userId: principal.userId,
    kind: input.kind,
    nodeId: input.nodeId,
    payload: { ...(input.model ? { model: input.model } : {}), ...(assetId ? { assetId } : {}) },
  };
  const created = await insertDocumentActivityOnce({
    insertIfAbsent: async () => (await getDb().insert(documentAssistantEvent).values(values)
      .onConflictDoNothing({ target: documentAssistantEvent.id }).returning())[0],
    findExisting: async () => (await getDb().select().from(documentAssistantEvent).where(and(
      eq(documentAssistantEvent.id, id), eq(documentAssistantEvent.documentId, input.documentId),
      eq(documentAssistantEvent.workspaceId, workspaceId), eq(documentAssistantEvent.userId, principal.userId),
      eq(documentAssistantEvent.kind, input.kind), eq(documentAssistantEvent.nodeId, input.nodeId),
    )).limit(1))[0],
  });
  if (created.payload.assetId !== assetId) throw new DocumentConversationAccessError();
  const activity = toActivity(created);
  await persistActivities(principal, input.documentId, [activity]);
  return activity;
}

async function persistActivities(principal: Principal, documentId: string, activities: DocumentAssistantActivity[]) {
  if (!activities.length) return;
  const conversationId = await ensureDocumentConversation(principal, documentId);
  await persistDocumentActivityMessages({ ...getChatConversationInfrastructure(), principal, conversationId, activities,
    onPublishError: (error) => console.error('[document-activity-live-delivery-error]', { errorName: error instanceof Error ? error.name : 'UnknownError' }),
  });
}

function toActivity(row: typeof documentAssistantEvent.$inferSelect): DocumentAssistantActivity {
  const model = typeof row.payload?.model === 'string' ? row.payload.model : undefined;
  const isVideo = row.kind === 'video-generated';
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    kind: isVideo ? 'video-generated' : 'image-generated',
    nodeId: row.nodeId,
    title: isVideo ? 'Видео готово' : 'Изображение готово',
    subtitle: model ? `Ровер завершил задачу · ${model}` : 'Ровер завершил задачу',
  };
}

async function requireDocumentScope(principal: Principal, documentId: string) {
  if (principal.productId !== CHAT_ASSISTANT_PRODUCT_ID || !principal.tenantId) throw new DocumentConversationAccessError();
  const current = await getDocument(principal.userId, documentId).catch(() => undefined);
  if (!current || current.workspaceId !== principal.tenantId || current.status !== 'active') throw new DocumentConversationAccessError();
  return principal.tenantId;
}
