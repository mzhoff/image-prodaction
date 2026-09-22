import { getTimelineConversation } from '@/app/api-routes/stories/timeline-conversation-route';
export async function GET(request: Request, context: { params: Promise<{ timelineId: string }> }) {
  return getTimelineConversation(request, (await context.params).timelineId);
}
