import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { readAccountModelPreferences, writeAccountModelPreference } from '@/modules/model-preferences/server/model-preference-repository';
import { modelPreferenceChangeSchema } from '@/modules/model-preferences/server/model-preference-schema';
import { ModelPreferenceConflict } from '@/shared/model-preferences/contracts';
import { apiError } from '@/shared/api/api-error';
import { JsonRequestError, readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { toApiErrorResponse } from '../error-response';

export async function accountModelPreferences(request: Request) {
  try {
    const session = await requireApiSession(request);
    // A delayed browser mutation from an old login must never affect the new account.
    const expectedAccount = request.headers.get('x-account-id');
    if (expectedAccount && expectedAccount !== session.user.id) return apiError('account_changed', 'Аккаунт изменился. Обновите страницу.', 409);
    if (request.method === 'GET') {
      return Response.json(await readAccountModelPreferences(session.user.id), { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const parsed = modelPreferenceChangeSchema.safeParse(await readBoundedJsonObject(request, 128 * 1024));
    if (!parsed.success) return apiError('invalid_model_preference', 'Некорректные настройки моделей.', 400);
    const preference = await writeAccountModelPreference(session.user.id, parsed.data);
    return Response.json({ accountId: session.user.id, modality: parsed.data.modality, preference }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof JsonRequestError) return apiError('invalid_model_preference', 'Не удалось прочитать настройки моделей. Допустимо не более 500 избранных моделей.', error.status);
    if (error instanceof ModelPreferenceConflict) return apiError('revision_conflict', error.message, 409);
    if (error instanceof Error && error.message === 'favorite_limit') return apiError('favorite_limit', 'Можно сохранить до 500 моделей каждого типа.', 422);
    return toApiErrorResponse(error);
  }
}
