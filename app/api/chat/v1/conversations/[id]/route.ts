import { getChatConversation } from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const GET = getChatConversation;
