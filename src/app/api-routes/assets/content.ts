import { getAssetContent } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';

export async function getAssetContentResponse(request: Request, assetId: string) {
  try {
    if (!isUuidV7(assetId)) return apiError('invalid_asset_id', 'Invalid asset id.', 400);
    const variant = new URL(request.url).searchParams.get('variant');
    if (variant && variant !== 'thumbnail') {
      return apiError('invalid_asset_variant', 'Invalid asset variant.', 400);
    }
    const purpose = variant === 'thumbnail' ? 'thumbnail' : undefined;
    const session = await requireApiSession(request);
    const { byteSize, contentType, object } = await getAssetContent(
      session.user.id,
      assetId,
      undefined,
      purpose,
    );
    const contentLength = object.contentLength ?? byteSize;

    return new Response(object.body, {
      headers: {
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': String(contentLength),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
