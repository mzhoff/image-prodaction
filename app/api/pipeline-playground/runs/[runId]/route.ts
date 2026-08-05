import { getPipelinePlaygroundRunResponse } from '@/app/api-routes/pipeline-playground/runs';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getPipelinePlaygroundRunResponse(request, (await context.params).runId);
}
