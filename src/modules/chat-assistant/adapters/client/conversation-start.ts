'use client';

import type { ChatTurnRequest } from '@prodactionpro/chat-domain';

export type ConversationTarget = { kind: 'home' } | { kind: 'flow' | 'story' | 'timeline'; id: string };
export type ConversationIntent = Pick<ChatTurnRequest, 'message' | 'attachments'>;

/** A screen is a local draft. Only an explicit submission materializes its conversation. */
export function createConversationStarter(workspaceId: string, target: ConversationTarget, request = fetch) {
  let requestId: string | undefined;
  let pending: Promise<string> | undefined;
  let conversationId: string | undefined;
  return (intent: ConversationIntent): Promise<string> => {
    if (conversationId) return Promise.resolve(conversationId);
    if (pending) return pending;
    if (!intent.message.trim() && !intent.attachments?.length) return Promise.reject(new Error('Добавьте сообщение или материалы.'));
    requestId ??= crypto.randomUUID();
    pending = request('/api/product-chat/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({ target, requestId, message: intent.message, hasAttachments: Boolean(intent.attachments?.length) }),
      signal: AbortSignal.timeout(30_000),
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.conversationId !== 'string') throw new Error('Не удалось начать разговор. Попробуйте отправить сообщение ещё раз.');
      conversationId = body.conversationId;
      return conversationId!;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
