import { getPipelineRuntimeRun } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getPipelineRuntimeRun(request, (await context.params).runId);
}
