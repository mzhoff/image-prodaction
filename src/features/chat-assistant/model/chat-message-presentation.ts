import type { ChatBlock, ChatMessage } from '@prodactionpro/chat-domain';

export function prepareChatMessagesForPresentation(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => {
    if (message.role !== 'assistant') return message;

    return {
      ...message,
      blocks: message.blocks.map(toMarkdownBlock),
      metadata: {
        ...message.metadata,
        ...(index === messages.length - 1 ? { animate: true } : {}),
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
