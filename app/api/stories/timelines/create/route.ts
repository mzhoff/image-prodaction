import { timelineProductionRequest } from '@/app/api-routes/stories/timeline-production-routes';

export const runtime = 'nodejs';
async function handler(request: Request) { return timelineProductionRequest(request, { action: 'create' }); }
export { handler as POST };
