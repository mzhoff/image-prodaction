import { getChatConversation } from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => getChatConversation(request, context);
