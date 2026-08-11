import type { ChatMessage } from '@prodactionpro/chat-domain';

export function getChatMessageCopyText(message: ChatMessage) {
  return message.blocks
    .flatMap((block) => {
      if (block.type === 'text' || block.type === 'markdown') return [block.content];
      return [];
    })
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function formatChatMessageTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date);
}
