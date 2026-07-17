import { cancelGenerationJobRequest } from '@/app/api-routes/generation-jobs/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return cancelGenerationJobRequest(request, (await context.params).jobId);
}
