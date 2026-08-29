'use client';

import { RestSseChatClient } from '@prodactionpro/chat-sdk';
import { CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS } from '../../contracts/assistant-config';

export function createImageProductionChatClient(workspaceId: string) {
  return new RestSseChatClient({
    baseUrl: '/api',
    defaultHeaders: () => ({ 'x-workspace-id': workspaceId }),
    defaultRequestTimeoutMs: CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS,
  });
}
