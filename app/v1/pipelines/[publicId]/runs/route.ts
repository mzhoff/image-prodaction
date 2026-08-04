import { postPipelineRuntimeRun } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ publicId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return postPipelineRuntimeRun(request, (await context.params).publicId);
}
