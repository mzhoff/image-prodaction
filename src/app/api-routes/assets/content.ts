import { getAssetContent } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';
import { AssetRangeError } from '@/shared/storage/byte-range';

export async function getAssetContentResponse(request: Request, assetId: string) {
  try {
    if (!isUuidV7(assetId)) return apiError('invalid_asset_id', 'Invalid asset id.', 400);
    const variant = new URL(request.url).searchParams.get('variant');
    if (variant && variant !== 'thumbnail') {
      return apiError('invalid_asset_variant', 'Invalid asset variant.', 400);
    }
    const purpose = variant === 'thumbnail' ? 'thumbnail' : undefined;
    const session = await requireApiSession(request);
    const { byteSize, contentType, object, range } = await getAssetContent(
      session.user.id,
      assetId,
      undefined,
      purpose,
      request.headers.get('range') ?? undefined,
    );
    const contentLength = range ? range.end - range.start + 1 : object.contentLength ?? byteSize;

    return new Response(object.body, {
      status: range ? 206 : 200,
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${range.total}` } : {}),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': String(contentLength),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AssetRangeError) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${error.total}`, 'Cache-Control': 'private, no-store' } });
    return toAssetApiErrorResponse(error);
  }
}
