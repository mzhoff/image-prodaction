import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { resolveChatPrincipal } from '@/modules/chat-assistant/server/auth';
import { findStoryConversation } from '@/modules/chat-assistant/server/story-conversation';
import { isUuid } from '@/shared/lib/id';
export async function getStoryConversation(request: Request, id: string) {
  try {
    if (!isUuid(id)) return Response.json({ error: 'Неверная раскадровка.' }, { status: 400 });
    const conversationId = await findStoryConversation(await resolveChatPrincipal(request), id);
    return Response.json({ conversationId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
