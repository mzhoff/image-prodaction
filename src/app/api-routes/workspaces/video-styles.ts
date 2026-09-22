import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { saveVideoStylePresetSchema } from '@/modules/video-style-presets/contracts/video-style-preset';
import { deleteVideoStylePreset, listVideoStylePresets, saveVideoStylePreset } from '@/modules/video-style-presets/server/video-style-preset-service';
import { VideoStylePresetError } from '@/modules/video-style-presets/server/video-style-preset-policy';
import { apiError } from '@/shared/api/api-error';
import { JsonRequestError, readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { isUuid, isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function videoStyleRequest(request: Request, workspaceId: string, id?: string) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(workspaceId) || (id && !isUuidV7(id))) return apiError('invalid_id', 'Некорректный адрес стиля.', 400);
    if (request.method === 'GET') return Response.json({ presets: await listVideoStylePresets(session.user.id, workspaceId) },
      { headers: { 'Cache-Control': 'private, no-store' } });
    if (!id) return apiError('invalid_id', 'Укажите стиль.', 400);
    const body = await readBoundedJsonObject(request, 16 * 1024);
    if (request.method === 'DELETE') {
      const parsed = z.object({ expectedRevision: z.number().int().positive() }).strict().safeParse(body);
      if (!parsed.success) return apiError('invalid_revision', 'Обновите список стилей перед удалением.', 422);
      await deleteVideoStylePreset(session.user.id, workspaceId, id, parsed.data.expectedRevision);
      return new Response(null, { status: 204 });
    }
    const parsed = saveVideoStylePresetSchema.safeParse(body);
    if (!parsed.success) return apiError('invalid_style', 'Проверьте название, описание стиля и обложку.', 422);
    return Response.json({ preset: await saveVideoStylePreset(session.user.id, workspaceId, id, parsed.data) });
  } catch (error) {
    if (error instanceof VideoStylePresetError) return apiError('style_error', error.message, error.status);
    if (error instanceof JsonRequestError) return apiError('invalid_style_body', 'Не удалось прочитать настройки стиля.', error.status);
    return toApiErrorResponse(error);
  }
}
