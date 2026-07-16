import { ensurePersonalWorkspace, listUserWorkspaces } from '@/entities/workspace/server/workspace-service';
import { requireApiSession } from '@/shared/auth/session';
import { toApiErrorResponse } from '../error-response';

export async function getWorkspaces(request: Request) {
  try {
    const session = await requireApiSession(request);
    await ensurePersonalWorkspace(session.user);
    return Response.json({ workspaces: await listUserWorkspaces(session.user.id) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
