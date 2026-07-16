import { deleteAssetRequest, getAsset } from '@/app/api-routes/assets/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getAsset(request, (await context.params).assetId);
}

export async function DELETE(request: Request, context: RouteContext) {
  return deleteAssetRequest(request, (await context.params).assetId);
}
