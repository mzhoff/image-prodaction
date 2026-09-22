import { timelineRequest } from '@/app/api-routes/stories/timeline-routes';
async function handler(request: Request, context: { params: Promise<{ timelineId: string }> }) {
  return timelineRequest(request, (await context.params).timelineId);
}
export const GET = handler;
export const PUT = handler;
