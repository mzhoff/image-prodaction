import { z } from 'zod';
import { createStudioFolder, listStudioFolders, removeStudioFolder, updateStudioFolder } from '@/entities/workspace/server/studio-folder-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuidV7, isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export async function folderRequest(request: Request, workspaceId: string, folderId?: string) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(workspaceId) || (folderId && !isUuidV7(folderId))) return apiError('invalid_id', 'Invalid folder or workspace.', 400);
    if (request.method === 'GET') return Response.json({ folders: await listStudioFolders(session.user.id, workspaceId) });
    if (request.method === 'DELETE' && folderId) {
      await removeStudioFolder(session.user.id, workspaceId, folderId);
      return new Response(null, { status: 204 });
    }
    const parsed = nameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError('invalid_name', 'Название проекта: от 1 до 120 символов.', 400);
    const folder = folderId
      ? await updateStudioFolder(session.user.id, workspaceId, folderId, parsed.data.name)
      : await createStudioFolder(session.user.id, workspaceId, parsed.data.name);
    return Response.json({ folder }, { status: folderId ? 200 : 201 });
  } catch (error) { return toApiErrorResponse(error); }
}
