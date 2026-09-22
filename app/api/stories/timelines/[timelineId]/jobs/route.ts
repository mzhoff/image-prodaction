import { timelineProductionRequest } from '@/app/api-routes/stories/timeline-production-routes';

export const runtime = 'nodejs';
async function handler(request: Request, context: { params: Promise<{ timelineId: string }> }) {
  return timelineProductionRequest(request, { ...await context.params, action: 'jobs' });
}
export { handler as POST };
