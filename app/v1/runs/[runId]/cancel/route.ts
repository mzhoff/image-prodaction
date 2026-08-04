import { cancelPipelineRuntimeRun } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return cancelPipelineRuntimeRun(request, (await context.params).runId);
}
