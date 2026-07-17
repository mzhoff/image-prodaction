import { getWorkspaceUsage } from '@/modules/usage';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function getWorkspaceAiUsage(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) {
      return apiError('invalid_workspace_id', 'Invalid workspace id.', 400);
    }
    const session = await requireApiSession(request);
    const periodDays = Number.parseInt(
      new URL(request.url).searchParams.get('periodDays') ?? '30',
      10,
    );
    const usage = await getWorkspaceUsage(session.user.id, workspaceId, periodDays);
    return Response.json(usage, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
