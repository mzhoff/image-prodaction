'use client';

import { RestSseChatClient } from '@prodactionpro/chat-sdk';
import { CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS } from '../../contracts/assistant-config';
import { createConversationStarter, type ConversationTarget } from './conversation-start';

export function createImageProductionChatClient(workspaceId: string, target?: ConversationTarget, beforeStart?: () => Promise<unknown>) {
  const client = new RestSseChatClient({
    baseUrl: '/api',
    defaultHeaders: () => ({ 'x-workspace-id': workspaceId }),
    defaultRequestTimeoutMs: CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS,
  });
  const starter = target ? createConversationStarter(workspaceId, target) : undefined;
  const start: typeof starter = starter ? async (payload) => { await beforeStart?.(); return starter(payload); } : undefined;
  // Product binding is resolved before the released runtime sends the first turn.
  // Uploads, reads and opening a document never call this adapter.
  if (start) {
    const stream = client.streamTurn.bind(client), turn = client.createTurn.bind(client);
    client.streamTurn = async (payload, options) => stream({ ...payload,
      conversationId: payload.conversationId ?? await start(payload) }, options);
    client.createTurn = async (payload, options) => turn({ ...payload,
      conversationId: payload.conversationId ?? await start(payload) }, options);
  }
  return Object.assign(client, { startConversation: start });
}
