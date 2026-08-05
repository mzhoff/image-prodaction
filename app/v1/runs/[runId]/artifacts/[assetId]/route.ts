import { getPipelineRuntimeArtifact } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ assetId: string; runId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  return getPipelineRuntimeArtifact(request, params.runId, params.assetId);
}
