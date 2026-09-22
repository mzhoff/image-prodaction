import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { resolveChatPrincipal } from '@/modules/chat-assistant/server/auth';
import { findTimelineConversation } from '@/modules/chat-assistant/server/timeline-conversation';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { isUuid } from '@/shared/lib/id';

export async function getTimelineConversation(request: Request, id: string) {
  try {
    if (!isUuid(id)) return Response.json({ error: 'Неверный адрес монтажа.' }, { status: 400 });
    const conversationId = await findTimelineConversation(await resolveChatPrincipal(request), id);
    return Response.json({ conversationId }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof StoryError) return Response.json({ error: error.message }, { status: error.status });
    return createRouteErrorResponse(error);
  }
}
