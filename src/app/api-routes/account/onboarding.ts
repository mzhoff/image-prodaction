import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { readOnboarding, saveOnboarding } from '@/modules/user-onboarding/server/onboarding-repository';
import { onboardingChangeSchema, OnboardingConflict, OnboardingInvalid } from '@/shared/onboarding/contract';
import { apiError } from '@/shared/api/api-error';
import { JsonRequestError, readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { toApiErrorResponse } from '../error-response';

export async function accountOnboarding(request: Request) {
  try {
    const session = await requireApiSession(request);
    const account = request.headers.get('x-account-id');
    if (account && account !== session.user.id) return apiError('account_changed', 'Аккаунт изменился. Обновите страницу.', 409);
    let value;
    if (request.method === 'GET') value = await readOnboarding(session.user.id, session.user.name);
    else {
      // JSON plus a same-origin request prevents cross-site form submissions.
      if (!request.headers.get('content-type')?.startsWith('application/json') || !account) {
        return apiError('invalid_request', 'Неверный формат запроса.', 400);
      }
      if (request.headers.get('sec-fetch-site') === 'cross-site') return apiError('forbidden', 'Запрос с другого сайта отклонён.', 403);
      const parsed = onboardingChangeSchema.safeParse(await readBoundedJsonObject(request, 16 * 1024));
      if (!parsed.success) return apiError('invalid_onboarding', 'Проверьте ответы в анкете.', 400);
      value = await saveOnboarding(session.user.id, parsed.data);
    }
    return Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OnboardingConflict) return apiError('revision_conflict', error.message, 409);
    if (error instanceof OnboardingInvalid) return apiError('invalid_onboarding', error.message, 422);
    if (error instanceof JsonRequestError) return apiError('invalid_json', 'Не удалось прочитать анкету.', error.status);
    return toApiErrorResponse(error);
  }
}
