import { getChatMessages, postChatMessage } from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => getChatMessages(request, context);
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => postChatMessage(request, context);
