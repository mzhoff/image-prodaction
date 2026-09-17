import { and, desc, eq, sql } from 'drizzle-orm';
import {
  chatConversations,
  chatToolCalls,
} from '@prodactionpro/chat-persistence-drizzle/schema';
import { getDocument } from '@/entities/document/server/document-service';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { chatDocumentConversation } from './document-conversation-schema';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { ensureCanonicalActivityConversation } from './document-activity-chat-adapter';

interface DocumentConversationPrincipal {
  productId: string;
  tenantId?: string;
  userId: string;
}

export async function findDocumentConversation(
  principal: DocumentConversationPrincipal,
  documentId: string,
) {
  const workspaceId = await requireDocumentScope(principal, documentId);
  const [bound] = await getDb().select({ conversationId: chatDocumentConversation.conversationId })
    .from(chatDocumentConversation)
    .innerJoin(chatConversations, eq(chatConversations.id, chatDocumentConversation.conversationId))
    .where(and(
      eq(chatDocumentConversation.documentId, documentId),
      eq(chatDocumentConversation.workspaceId, workspaceId),
      eq(chatDocumentConversation.userId, principal.userId),
      eq(chatConversations.productId, CHAT_ASSISTANT_PRODUCT_ID),
      eq(chatConversations.tenantId, workspaceId),
      eq(chatConversations.userId, principal.userId),
    )).limit(1);
  if (bound) return bound.conversationId;

  const [legacy] = await getDb().select({ conversationId: chatConversations.id })
    .from(chatConversations)
    .innerJoin(chatToolCalls, eq(chatToolCalls.conversationId, chatConversations.id))
    .where(and(
      eq(chatConversations.productId, CHAT_ASSISTANT_PRODUCT_ID),
      eq(chatConversations.tenantId, workspaceId),
      eq(chatConversations.userId, principal.userId),
      sql`${chatToolCalls.contextSelectors} -> 'document' ->> 'id' = ${documentId}`,
    ))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);
  return legacy?.conversationId;
}

export async function bindDocumentConversation(
  principal: DocumentConversationPrincipal,
  documentId: string,
  conversationId: string,
) {
  const workspaceId = await requireDocumentScope(principal, documentId);
  const [conversation] = await getDb().select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(
      eq(chatConversations.id, conversationId),
      eq(chatConversations.productId, CHAT_ASSISTANT_PRODUCT_ID),
      eq(chatConversations.tenantId, workspaceId),
      eq(chatConversations.userId, principal.userId),
    )).limit(1);
  if (!conversation) throw new DocumentConversationAccessError();

  await getDb().insert(chatDocumentConversation).values({
    id: createUuidV7(),
    conversationId,
    documentId,
    userId: principal.userId,
    workspaceId,
  }).onConflictDoNothing({
    target: [chatDocumentConversation.documentId, chatDocumentConversation.userId],
  });
  const canonicalId = await findDocumentConversation(principal, documentId);
  if (!canonicalId) throw new DocumentConversationAccessError();
  return canonicalId;
}

export async function ensureDocumentConversation(principal: DocumentConversationPrincipal, documentId: string) {
  await requireDocumentScope(principal, documentId);
  return ensureCanonicalActivityConversation({
    principal, documentId, store: getChatConversationInfrastructure().store,
    findBound: () => findDocumentConversation(principal, documentId),
    bind: (conversationId) => bindDocumentConversation(principal, documentId, conversationId),
  });
}

async function requireDocumentScope(principal: DocumentConversationPrincipal, documentId: string) {
  if (principal.productId !== CHAT_ASSISTANT_PRODUCT_ID || !principal.tenantId) {
    throw new DocumentConversationAccessError();
  }
  const current = await getDocument(principal.userId, documentId).catch(() => undefined);
  if (!current || current.workspaceId !== principal.tenantId || current.status !== 'active') {
    throw new DocumentConversationAccessError();
  }
  return principal.tenantId;
}

export class DocumentConversationAccessError extends Error {
  constructor() {
    super('Document conversation was not found.');
    this.name = 'DocumentConversationAccessError';
  }
}
