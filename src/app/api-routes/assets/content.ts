import { getAssetContent } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';

export async function getAssetContentResponse(request: Request, assetId: string) {
  try {
    if (!isUuidV7(assetId)) return apiError('invalid_asset_id', 'Invalid asset id.', 400);
    const session = await requireApiSession(request);
    const { asset, object } = await getAssetContent(session.user.id, assetId);
    const contentLength = object.contentLength ?? asset.byteSize;

    return new Response(object.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Length': String(contentLength),
        'Content-Type': asset.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
