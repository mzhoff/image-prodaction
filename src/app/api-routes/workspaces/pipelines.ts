import { listExecutablePipelineCatalog } from '@/modules/executable-pipelines/server/pipeline-catalog-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function getWorkspacePipelines(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) {
      return apiError('invalid_workspace_id', 'Invalid workspace id.', 400);
    }
    const session = await requireApiSession(request);
    const catalog = await listExecutablePipelineCatalog({
      userId: session.user.id,
      workspaceId,
    });
    return Response.json(catalog, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
