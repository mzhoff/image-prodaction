import {
  getChatMessages,
  postChatMessage,
} from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const GET = getChatMessages;
export const POST = postChatMessage;
