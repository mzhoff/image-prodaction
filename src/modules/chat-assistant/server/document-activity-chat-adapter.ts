import { createHash } from 'node:crypto';
import type { ConversationEventBus, ConversationStore } from '@prodactionpro/chat-application';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import { createChatEvent, CHAT_EVENT_TYPES } from '@prodactionpro/chat-protocol';
import { assertChatResourceAccess, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import type { DocumentAssistantActivity } from '../contracts/document-assistant-activity';
import { documentActivityToChatMessage } from '../contracts/document-activity-message';
import { CHAT_ASSISTANT_MODE } from '../contracts/assistant-config';

type ActivityStore = Pick<ConversationStore, 'appendMessage' | 'create' | 'findById' | 'listMessages'>;

export async function ensureCanonicalActivityConversation(input: {
  principal: ChatPrincipal;
  documentId: string;
  store: ActivityStore;
  findBound: () => Promise<string | undefined>;
  bind: (conversationId: string) => Promise<string>;
}) {
  const existingId = await input.findBound();
  if (existingId) {
    await requireOwnedConversation(input.store, existingId, input.principal);
    return input.bind(existingId);
  }
  const digest = createHash('sha256').update(JSON.stringify([
    input.principal.productId, input.principal.tenantId, input.principal.userId, input.documentId,
  ])).digest('hex');
  const conversationId = `document:${digest}`;
  try {
    await input.store.create({ id: conversationId, mode: CHAT_ASSISTANT_MODE, title: 'Работа с документом',
      productId: input.principal.productId, tenantId: input.principal.tenantId, userId: input.principal.userId });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await requireOwnedConversation(input.store, conversationId, input.principal);
  }
  return input.bind(conversationId);
}

/** Stable message/event IDs make retries and document-history backfill safe. */
export async function persistDocumentActivityMessages(input: {
  principal: ChatPrincipal;
  conversationId: string;
  activities: DocumentAssistantActivity[];
  store: ActivityStore;
  eventBus: Pick<ConversationEventBus, 'publish'>;
  onPublishError?: (error: unknown) => void;
}) {
  await requireOwnedConversation(input.store, input.conversationId, input.principal);
  const existing = new Map((await input.store.listMessages(input.conversationId)).map((message) => [message.id, message]));
  const messages: ChatMessage[] = [];
  for (const activity of input.activities) {
    const proposed = documentActivityToChatMessage(activity, input.conversationId);
    let message = existing.get(proposed.id);
    let appended = false;
    if (!message) {
      try {
        message = await input.store.appendMessage(proposed);
        appended = true;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        message = (await input.store.listMessages(input.conversationId)).find((candidate) => candidate.id === proposed.id);
        if (!message) throw error;
      }
      existing.set(message.id, message);
    }
    if (message.role !== 'assistant' || message.conversationId !== input.conversationId) {
      throw new Error('Document activity message ownership mismatch.');
    }
    if (appended) {
      const envelope = createChatEvent({ conversationId: input.conversationId, data: message,
        emittedAt: message.createdAt, eventId: `document-activity-message:${activity.id}`, sequence: 0, type: CHAT_EVENT_TYPES.messageCompleted });
      const { data: _data, type: _type, ...meta } = envelope;
      try {
        await input.eventBus.publish(input.conversationId, { event: 'message', data: message, meta });
      } catch (error) {
        // History is already durable. The host's document refresh reconciles missed live events.
        input.onPublishError?.(error);
      }
    }
    messages.push(message);
  }
  return messages;
}

async function requireOwnedConversation(store: ActivityStore, id: string, principal: ChatPrincipal) {
  const conversation = await store.findById(id);
  if (!conversation) throw new Error('Document activity conversation was not found.');
  assertChatResourceAccess(principal, conversation);
  if (conversation.productId !== principal.productId || conversation.tenantId !== principal.tenantId || conversation.userId !== principal.userId) {
    throw new Error('Document activity conversation ownership is not explicit.');
  }
  if (conversation.status !== 'active') throw new Error('Document activity conversation is inactive.');
  return conversation;
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ('code' in current && current.code === '23505') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
