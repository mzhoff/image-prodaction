import { z } from 'zod';
import { listLibraryAssets } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';

const originSchema = z.enum(['uploaded', 'generated', 'saved', 'unknown']);
const mediaKindSchema = z.enum(['image', 'video']);

export async function getAssetLibrary(request: Request) {
  try {
    const session = await requireApiSession(request);
    const params = new URL(request.url).searchParams;
    const workspaceId = params.get('workspaceId')?.trim();
    if (!workspaceId || !isUuidV7(workspaceId)) {
      return apiError('invalid_workspace_id', 'Valid workspaceId is required.', 400);
    }

    const origins = parseEnumFilters(params, 'origin', originSchema);
    if (origins instanceof Response) return origins;
    const mediaKinds = parseEnumFilters(params, 'mediaKind', mediaKindSchema);
    if (mediaKinds instanceof Response) return mediaKinds;
    const documentIds = parseTextFilters(params, 'documentId');
    if (documentIds.some((value) => !isUuidV7(value))) {
      return apiError('invalid_document_id', 'Document filters must be valid ids.', 400);
    }

    const limitValue = params.get('limit');
    const limit = limitValue === null ? undefined : Number(limitValue);
    const page = await listLibraryAssets(session.user.id, {
      workspaceId,
      origins,
      mediaKinds,
      providers: parseTextFilters(params, 'provider'),
      modelIds: parseTextFilters(params, 'modelId'),
      documentIds,
      search: params.get('search') ?? undefined,
      cursor: params.get('cursor'),
      limit,
    });
    return Response.json(page, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}

function parseTextFilters(params: URLSearchParams, name: string) {
  return params.getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseEnumFilters<T extends string>(
  params: URLSearchParams,
  name: string,
  schema: z.ZodEnum<Record<T, T>>,
): T[] | Response {
  const values = parseTextFilters(params, name);
  const parsed = z.array(schema).safeParse(values);
  return parsed.success
    ? parsed.data
    : apiError(`invalid_${name}_filter`, `Invalid ${name} filter.`, 400);
}
