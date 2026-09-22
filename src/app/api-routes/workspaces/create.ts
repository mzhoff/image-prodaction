import { workspaceCreateSchema } from '@/entities/workspace/model/workspace-create';
import { createTeamWorkspace, WorkspaceCreateConflict } from '@/entities/workspace/server/create-team-workspace';
import { readAuthServerConfig } from '@/shared/auth/config';
import { apiError } from '@/shared/api/api-error';

const dependencies = {
  session: async (request: Request): Promise<{ user: { id: string } } | null> => {
    const { getRequestSession } = await import('@/modules/authentication/server/auth-session');
    return getRequestSession(request);
  },
  origins: () => readAuthServerConfig().trustedOrigins,
  create: createTeamWorkspace,
};

export async function handleCreateWorkspace(request: Request, ports = dependencies) {
  try {
    if (!ports.origins().includes(request.headers.get('origin') ?? '')) return apiError('invalid_origin', 'Обновите страницу и повторите попытку.', 403);
    const session = await ports.session(request);
    if (!session?.user.id) return apiError('unauthorized', 'Войдите в аккаунт.', 401);
    const parsed = workspaceCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError('invalid_workspace', 'Укажите название от 1 до 120 символов.', 400);
    const workspace = await ports.create(session.user.id, parsed.data);
    return Response.json({ workspace }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof WorkspaceCreateConflict) return apiError('workspace_conflict', 'Этот запрос уже использован. Закройте форму и попробуйте снова.', 409);
    return apiError('workspace_unavailable', 'Не удалось создать пространство. Попробуйте ещё раз.', 503);
  }
}

export function postWorkspace(request: Request) { return handleCreateWorkspace(request); }
