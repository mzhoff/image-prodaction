import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { getProjectContents } from '@/modules/project-containers/server/project-contents';
import { AssetLibraryQueryError } from '@/entities/asset/server/asset-service-contracts';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function projectContentsRequest(request: Request, folderId: string) {
  try {
    const session = await requireApiSession(request);
    const params = new URL(request.url).searchParams;
    const workspaceId = params.get('workspaceId');
    if (!isUuid(folderId) || !workspaceId || !isUuid(workspaceId)) return apiError('invalid_project', 'Выберите проект в своём Workspace.', 400);
    const result = await getProjectContents(session.user.id, workspaceId, folderId, {
      cursor: params.get('cursor'), search: params.get('q') ?? undefined,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AssetLibraryQueryError) return apiError('invalid_cursor', 'Обновите список материалов и повторите попытку.', 400);
    return toApiErrorResponse(error);
  }
}
