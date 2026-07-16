import { deleteAsset, getAssetMetadata } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';

export async function getAsset(request: Request, assetId: string) {
  try {
    if (!isUuidV7(assetId)) return apiError('invalid_asset_id', 'Invalid asset id.', 400);
    const session = await requireApiSession(request);
    const metadata = await getAssetMetadata(session.user.id, assetId);
    return Response.json({ asset: metadata }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}

export async function deleteAssetRequest(request: Request, assetId: string) {
  try {
    if (!isUuidV7(assetId)) return apiError('invalid_asset_id', 'Invalid asset id.', 400);
    const session = await requireApiSession(request);
    await deleteAsset(session.user.id, assetId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
