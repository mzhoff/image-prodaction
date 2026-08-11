'use client';

import type { ChatTurnRequest } from '@prodactionpro/chat-domain';
import { RestSseChatClient, type ChatStreamOptions } from '@prodactionpro/chat-sdk';

export function createImageProductionChatClient(workspaceId: string) {
  return new ImageProductionChatClient({
    baseUrl: '/api',
    defaultHeaders: () => ({ 'x-workspace-id': workspaceId }),
    defaultRequestTimeoutMs: 45_000,
    // ChatModule 0.5.1 stores the browser fetch function and later invokes it
    // as a client method. Bind it explicitly so native browsers keep the
    // required global receiver instead of throwing `Illegal invocation`.
    fetcher: globalThis.fetch.bind(globalThis),
  });
}

class ImageProductionChatClient extends RestSseChatClient {
  /**
   * ChatModule 0.5.1 maps `message.completed` to an SSE `message` containing
   * only ChatMessage, while its SDK interprets that event as ChatTurnResponse.
   * Use the supported JSON turn endpoint until the package aligns the SSE
   * protocol. The runtime contract remains unchanged and cancellation still
   * reaches the server through the request signal.
   */
  override streamTurn(payload: ChatTurnRequest, options?: ChatStreamOptions) {
    return this.createTurn(payload, { signal: options?.signal });
  }
}
