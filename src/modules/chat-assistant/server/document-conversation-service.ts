import { and, desc, eq, sql } from 'drizzle-orm';
import { chatContextSelectorsSchema, type ChatContextSelectors } from '@prodactionpro/chat-domain';
import {
  chatConversations,
  chatMessages,
  chatToolCalls,
} from '@prodactionpro/chat-persistence-drizzle/schema';
import { getDocument } from '@/entities/document/server/document-service';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { chatDocumentConversation } from './document-conversation-schema';

interface DocumentConversationPrincipal {
  productId: string;
  tenantId?: string;
  userId: string;
}

export function resolveBoundConversationContextSelectors(input: {
  bindingDocumentIds: readonly string[];
  latestUserMessageMetadata: unknown;
}): ChatContextSelectors | undefined {
  if (input.bindingDocumentIds.length !== 1) return undefined;
  if (!isRecord(input.latestUserMessageMetadata)) return undefined;

  const parsed = chatContextSelectorsSchema.safeParse(
    input.latestUserMessageMetadata.contextSelectors,
  );
  if (!parsed.success || !parsed.data.document) return undefined;
  if (parsed.data.document.id !== input.bindingDocumentIds[0]) return undefined;
  return parsed.data;
}

export async function findBoundConversationContextSelectors(
  principal: DocumentConversationPrincipal,
  conversationId: string,
): Promise<ChatContextSelectors | undefined> {
  const workspaceId = principal.tenantId;
  if (principal.productId !== CHAT_ASSISTANT_PRODUCT_ID || !workspaceId) return undefined;

  const bindings = await getDb().select({ documentId: chatDocumentConversation.documentId })
    .from(chatDocumentConversation)
    .innerJoin(chatConversations, eq(chatConversations.id, chatDocumentConversation.conversationId))
    .where(and(
      eq(chatDocumentConversation.conversationId, conversationId),
      eq(chatDocumentConversation.workspaceId, workspaceId),
      eq(chatDocumentConversation.userId, principal.userId),
      eq(chatConversations.id, conversationId),
      eq(chatConversations.productId, CHAT_ASSISTANT_PRODUCT_ID),
      eq(chatConversations.tenantId, workspaceId),
      eq(chatConversations.userId, principal.userId),
    ))
    .limit(2);
  if (bindings.length !== 1) return undefined;

  const [latestUserMessage] = await getDb().select({ metadata: chatMessages.metadata })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      eq(chatMessages.role, 'user'),
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);

  return resolveBoundConversationContextSelectors({
    bindingDocumentIds: bindings.map((binding) => binding.documentId),
    latestUserMessageMetadata: latestUserMessage?.metadata,
  });
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
  }).onConflictDoUpdate({
    target: [chatDocumentConversation.documentId, chatDocumentConversation.userId],
    set: { conversationId, updatedAt: new Date(), workspaceId },
  });
  return conversationId;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
