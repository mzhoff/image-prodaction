import type { ToolCallRecord } from '@prodactionpro/chat-domain';

export function getVisibleChatToolCalls(toolCalls: ToolCallRecord[]): ToolCallRecord[] {
  return toolCalls.filter((toolCall) => (
    toolCall.status === 'needs-confirmation' || toolCall.status === 'failed'
  ));
}
