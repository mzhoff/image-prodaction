import type { AgentModelMessage } from '@prodactionpro/chat-connectors';

export function collapseConsecutiveDuplicateAgentUserMessages(
  messages: AgentModelMessage[],
): AgentModelMessage[] {
  return messages.reduce<AgentModelMessage[]>((result, message) => {
    const previous = result.at(-1);
    if (
      message.role === 'user'
      && previous?.role === 'user'
      && normalizePrompt(message.content) !== ''
      && normalizePrompt(message.content) === normalizePrompt(previous.content)
    ) {
      result[result.length - 1] = message;
      return result;
    }

    result.push(message);
    return result;
  }, []);
}

function normalizePrompt(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}
