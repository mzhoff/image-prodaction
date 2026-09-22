import { timelineProductionRequest } from '@/app/api-routes/stories/timeline-production-routes';

export const runtime = 'nodejs';
async function handler(request: Request, context: { params: Promise<{ timelineId: string; jobId: string }> }) {
  return timelineProductionRequest(request, { ...await context.params, action: 'job' });
}
export { handler as GET, handler as DELETE };
