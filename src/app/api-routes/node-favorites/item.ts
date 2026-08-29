import { z } from 'zod';
import { deleteFavoriteNode } from '@/entities/production-graph/server/favorite-node-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuidV7 } from '@/shared/lib/id';
import { toFavoriteNodeApiErrorResponse } from './error-response';

const uuidV7Schema = z.string().refine(isUuidV7);

export async function deleteFavoriteNodeItem(
  request: Request,
  favoriteId: string,
) {
  try {
    const session = await requireApiSession(request);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!uuidV7Schema.safeParse(favoriteId).success
      || !uuidV7Schema.safeParse(workspaceId).success) {
      return apiError('invalid_favorite_node', 'Valid favorite and workspace ids are required.', 400);
    }
    await deleteFavoriteNode({
      favoriteId,
      userId: session.user.id,
      workspaceId: workspaceId!,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return toFavoriteNodeApiErrorResponse(error);
  }
}
