import type { ChatMessage, ToolCallRecord } from '@prodactionpro/chat-domain';

const RETRYABLE_ERROR_PATTERNS = [
  /timed out/i,
  /failed to fetch/i,
  /network(?:\s+error| request failed)/i,
  /(?:status|http)\s*(?:408|502|503|504)\b/i,
];

export function canSafelyRetryChatTurn(input: {
  error?: string;
  messages: ChatMessage[];
  toolCalls: ToolCallRecord[];
}) {
  if (!input.error || !RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(input.error!))) {
    return false;
  }
  const latestUserMessage = findLatestUserMessage(input.messages);
  if (!latestUserMessage) return false;
  const latestUserAt = Date.parse(latestUserMessage.createdAt ?? '');
  return !input.toolCalls.some((toolCall) => {
    if (toolCall.riskLevel === 'read') return false;
    const toolCreatedAt = Date.parse(toolCall.createdAt);
    return !Number.isFinite(latestUserAt)
      || !Number.isFinite(toolCreatedAt)
      || toolCreatedAt >= latestUserAt;
  });
}

export function getLatestUserPrompt(messages: ChatMessage[]) {
  const message = findLatestUserMessage(messages);
  if (!message) return undefined;
  const prompt = message.blocks
    .filter((block) => block.type === 'text' || block.type === 'markdown')
    .map((block) => block.content)
    .join('\n')
    .trim();
  return prompt || undefined;
}

function findLatestUserMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index];
  }
  return undefined;
}
