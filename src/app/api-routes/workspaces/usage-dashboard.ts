import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { getUsageDashboard } from '@/modules/usage/server/usage-dashboard-service';
import { usagePeriod } from '@/modules/usage/core/usage-dashboard';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function getWorkspaceUsageDashboard(request: Request, workspaceId: string) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(workspaceId)) return apiError('invalid_workspace_id', 'Некорректный Workspace.', 400);
    const params = new URL(request.url).searchParams;
    let period;
    try { period = usagePeriod(params.get('from'), params.get('to'), params.get('timezone') ?? 'Europe/Moscow'); }
    catch (error) { return apiError('invalid_period', error instanceof Error ? error.message : 'Некорректный период.', 400); }
    return Response.json(await getUsageDashboard(session.user.id, workspaceId, period), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return toApiErrorResponse(error); }
}
