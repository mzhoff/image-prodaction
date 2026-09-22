import { timelineProductionRequest } from '@/app/api-routes/stories/timeline-production-routes';

export const runtime = 'nodejs';
async function handler(request: Request, context: { params: Promise<{ timelineId: string; jobId: string }> }) {
  return timelineProductionRequest(request, { ...await context.params, action: 'download' });
}
export { handler as GET };
