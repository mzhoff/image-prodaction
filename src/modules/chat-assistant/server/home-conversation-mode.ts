import type { AssistantMode } from '@prodactionpro/chat-domain';
import type { AssistantProviderResolverInput, ConversationStore } from '@prodactionpro/chat-application';
import { getChatConversationInfrastructure } from './conversation-infrastructure';

type HomeMode = 'general-chat' | 'image-generation';
export async function selectedHomeMode(conversationId: string,
  store: ConversationStore = getChatConversationInfrastructure().store): Promise<HomeMode> {
  const messages = await store.listMessages(conversationId);
  return normalizeHomeMode(messages.findLast((entry) => entry.role === 'user')?.metadata?.mode);
}

/** ChatModule 0.12.1 retries retain the original user message, but reconstruct mode
 * from conversation.mode. Recover the product mode from that message without
 * modifying ChatModule's tables or its agent loop. */
export async function effectiveHomeRequestMode(input: AssistantProviderResolverInput,
  store: ConversationStore = getChatConversationInfrastructure().store): Promise<AssistantMode> {
  if (!input.conversationId.startsWith('home:')) return input.request.mode;
  if (input.request.message === 'Continue after tool execution') return selectedHomeMode(input.conversationId, store);
  const turn = input.request.turnId ? await store.findAgentTurn(input.request.turnId) : null;
  if (!turn?.originalTurnId) return input.request.mode;
  const message = (await store.listMessages(input.conversationId)).find((entry) => entry.role === 'user'
    && entry.metadata?.turnId === turn.originalTurnId);
  return normalizeHomeMode(message?.metadata?.mode);
}
function normalizeHomeMode(value: unknown): HomeMode {
  return value === 'general-chat' ? 'general-chat' : 'image-generation';
}
