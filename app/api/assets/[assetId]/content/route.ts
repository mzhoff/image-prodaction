import { getAssetContentResponse } from '@/app/api-routes/assets/content';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getAssetContentResponse(request, (await context.params).assetId);
}
