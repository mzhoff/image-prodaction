import { getTimelineJob } from '@/app/api-routes/timeline/routes';
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return getTimelineJob(request, (await context.params).jobId);
}
