import type { ChatBlock, ChatMessage } from '@prodactionpro/chat-domain';

export function prepareChatMessagesForPresentation(
  messages: ChatMessage[],
  options: {
    collapseConsecutiveDuplicateUserMessages?: boolean;
    hideRuntimeErrors?: boolean;
    hideToolStatusBlocks?: boolean;
  } = {},
): ChatMessage[] {
  let visibleMessages = options.hideRuntimeErrors
    ? messages.filter((message) => !isRuntimeErrorMessage(message))
    : messages;

  if (options.hideToolStatusBlocks) {
    visibleMessages = visibleMessages.flatMap((message) => {
      const blocks = message.blocks.filter((block) => block.type !== 'tool-status');
      if (message.role === 'assistant' && blocks.length === 0) return [];
      return blocks.length === message.blocks.length ? [message] : [{ ...message, blocks }];
    });
  }

  if (options.collapseConsecutiveDuplicateUserMessages) {
    visibleMessages = collapseConsecutiveDuplicateUserMessages(visibleMessages);
  }

  return visibleMessages.map((message, index) => {
    if (message.role !== 'assistant') return message;

    return {
      ...message,
      blocks: message.blocks.map(toMarkdownBlock),
      metadata: {
        ...message.metadata,
        ...(index === visibleMessages.length - 1 ? { animate: true } : {}),
      },
    };
  });
}

function collapseConsecutiveDuplicateUserMessages(messages: ChatMessage[]) {
  return messages.reduce<ChatMessage[]>((result, message) => {
    const previous = result.at(-1);
    if (
      message.role === 'user'
      && previous?.role === 'user'
      && getComparableMessageContent(message) !== ''
      && getComparableMessageContent(message) === getComparableMessageContent(previous)
    ) {
      result[result.length - 1] = message;
      return result;
    }

    result.push(message);
    return result;
  }, []);
}

function getComparableMessageContent(message: ChatMessage) {
  return message.blocks
    .filter((block) => block.type === 'text' || block.type === 'markdown')
    .map((block) => block.content)
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRuntimeErrorMessage(message: ChatMessage) {
  return message.role === 'assistant'
    && message.blocks.length > 0
    && message.blocks.every((block) => block.type === 'error');
}

function toMarkdownBlock(block: ChatBlock): ChatBlock {
  if (block.type !== 'text') return block;
  return {
    content: block.content,
    type: 'markdown',
  };
}
