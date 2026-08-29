'use client';

import type {
  ChatTurnRequest,
  ChatTurnResponse,
  ToolCallRecord,
} from '@prodactionpro/chat-domain';
import {
  RestSseChatClient,
  type ChatRetryTurnRequest,
  type ChatStreamOptions,
} from '@prodactionpro/chat-sdk';
import { CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS } from '../../contracts/assistant-config';

export function createImageProductionChatClient(workspaceId: string) {
  return new ImageProductionChatClient({
    baseUrl: '/api',
    defaultHeaders: () => ({ 'x-workspace-id': workspaceId }),
    defaultRequestTimeoutMs: CHAT_ASSISTANT_CLIENT_REQUEST_TIMEOUT_MS,
  });
}

/**
 * ChatModule 0.11.0 delivers turn output and persistent tool events through
 * separate streams. A reconnect can advance past a completed tool event before
 * the React runtime sees it. Replaying the current turn's persisted records is
 * idempotent because ChatRuntime upserts tool calls by ID.
 *
 * Remove this consumer adapter after CM-028 is available and verified.
 */
class ImageProductionChatClient extends RestSseChatClient {
  override async streamTurn(payload: ChatTurnRequest, options?: ChatStreamOptions) {
    const result = await super.streamTurn(payload, options);
    await this.reconcileTurnToolCalls(result, options);
    return result;
  }

  override async retryTurn(payload: ChatRetryTurnRequest, options?: ChatStreamOptions) {
    const result = await super.retryTurn(payload, options);
    await this.reconcileTurnToolCalls(result, options);
    return result;
  }

  private async reconcileTurnToolCalls(result: ChatTurnResponse, options?: ChatStreamOptions) {
    try {
      const conversation = await this.getConversation(result.conversationId);
      const emittedIds = new Set<string>();
      for (const toolCall of conversation.toolCalls ?? []) {
        if (toolCall.turnId !== result.turnId || emittedIds.has(toolCall.id)) continue;
        emittedIds.add(toolCall.id);
        emitToolCallSnapshot(toolCall, options);
      }
    } catch {
      // The assistant turn already succeeded. Reconciliation is best-effort and
      // must never replace a valid answer with a secondary synchronization error.
      console.warn('[chat-assistant-tool-reconciliation-skipped]');
    }
  }
}

function emitToolCallSnapshot(toolCall: ToolCallRecord, options?: ChatStreamOptions) {
  if (!options?.onEvent) return;
  if (toolCall.status === 'queued' || toolCall.status === 'needs-confirmation') {
    options.onEvent({ data: toolCall, event: 'tool_call_requested' });
    return;
  }
  if (toolCall.status === 'running') {
    options.onEvent({ data: toolCall, event: 'tool_call_running' });
    return;
  }
  options.onEvent({ data: toolCall, event: 'tool_call_completed' });
}
