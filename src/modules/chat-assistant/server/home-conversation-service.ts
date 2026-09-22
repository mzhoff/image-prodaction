import { and, eq } from 'drizzle-orm';
import { assertChatResourceAccess, ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import type { Conversation } from '@prodactionpro/chat-domain';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { homeChatConversation } from './home-chat-schema';

export async function isHomeConversation(principal: ChatPrincipal, conversationId: string) {
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) return false;
  const [row] = await getDb().select({ id: homeChatConversation.conversationId }).from(homeChatConversation)
    .where(and(eq(homeChatConversation.conversationId, conversationId),
      eq(homeChatConversation.workspaceId, principal.tenantId), eq(homeChatConversation.userId, principal.userId))).limit(1);
  return Boolean(row);
}

interface HomeAccessDependencies {
  bindingExists(principal: ChatPrincipal, conversationId: string): Promise<boolean>;
  membership(userId: string, workspaceId: string): Promise<unknown>;
  conversation(conversationId: string): Promise<Conversation | null>;
}
const homeAccessDependencies: HomeAccessDependencies = {
  bindingExists: isHomeConversation, membership: requireWorkspaceMembership,
  conversation: (id) => getChatConversationInfrastructure().store.findById(id),
};

export async function requireHomeConversation(principal: ChatPrincipal, conversationId: string,
  dependencies: HomeAccessDependencies = homeAccessDependencies) {
  if (!await dependencies.bindingExists(principal, conversationId)) throw new ChatAccessError('Разговор недоступен.', 'forbidden');
  await dependencies.membership(principal.userId, principal.tenantId!);
  const conversation = await dependencies.conversation(conversationId);
  // ChatModule's error status records a failed turn, not revoked access: its history and retry must remain reachable.
  if (!conversation || !['active', 'error'].includes(conversation.status)) throw new ChatAccessError('Разговор недоступен.', 'forbidden');
  assertChatResourceAccess(principal, conversation);
  return conversation;
}

export async function restoreHomeConversation(principal: ChatPrincipal, selectedId?: string) {
  await assertWorkspace(principal);
  if (selectedId) return requireHomeConversation(principal, selectedId);
  return undefined; // A fresh Home screen is a browser draft, not a stored conversation.
}

export async function createHomeConversation(principal: ChatPrincipal, id = `home:${createUuidV7()}`) {
  await assertWorkspace(principal);
  const { store } = getChatConversationInfrastructure();
  const current = await store.findById(id);
  if (current) assertChatResourceAccess(principal, current);
  if (!current) try {
    await store.create({ id, mode: 'image-generation', title: 'Создание в Production',
      productId: principal.productId, tenantId: principal.tenantId, userId: principal.userId });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await store.findById(id);
    if (!existing) throw error;
    assertChatResourceAccess(principal, existing);
  }
  await getDb().insert(homeChatConversation).values({ conversationId: id,
    workspaceId: principal.tenantId!, userId: principal.userId }).onConflictDoNothing();
  return requireHomeConversation(principal, id);
}

async function assertWorkspace(principal: ChatPrincipal) {
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) {
    throw new ChatAccessError('Выберите рабочее пространство.', 'forbidden');
  }
  await requireWorkspaceMembership(principal.userId, principal.tenantId);
}
export function isUniqueViolation(error: unknown): boolean {
  let value = error;
  for (let depth = 0; depth < 5 && value && typeof value === 'object'; depth++) {
    if ('code' in value && value.code === '23505') return true;
    value = 'cause' in value ? value.cause : undefined;
  }
  return false;
}
