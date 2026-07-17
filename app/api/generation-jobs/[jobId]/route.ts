import { getGenerationJobRequest } from '@/app/api-routes/generation-jobs/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getGenerationJobRequest(request, (await context.params).jobId);
}
