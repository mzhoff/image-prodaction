import { isWorkspaceAiAccessError } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';
import type { ChatBlock, ChatMessage } from '@prodactionpro/chat-domain';

export function prepareChatMessagesForPresentation(
  messages: ChatMessage[],
): ChatMessage[] {
  // Access refusal is an action dialog, not a conversation reply. Only omit its
  // local optimistic message; never delete a persisted user turn or other errors.
  const hidden = new Set<string>();
  messages.forEach((message, index) => {
    if (message.metadata?.runtimeError && isWorkspaceAiAccessError({ code: message.metadata.errorCode })) {
      hidden.add(message.id);
      const previous = messages[index - 1];
      if (previous?.role === 'user' && previous.metadata?.optimistic === true) hidden.add(previous.id);
    }
  });
  const visible = messages.filter((message) => !hidden.has(message.id));
  return visible.map((message, index) => {
    if (message.role !== 'assistant') return message;

    return {
      ...message,
      blocks: message.blocks.map(toMarkdownBlock),
      metadata: {
        ...message.metadata,
        ...(index === visible.length - 1 && message.metadata?.animate !== false ? { animate: true } : {}),
      },
    };
  });
}

function toMarkdownBlock(block: ChatBlock): ChatBlock {
  if (block.type !== 'text') return block;
  return {
    content: block.content,
    type: 'markdown',
  };
}
