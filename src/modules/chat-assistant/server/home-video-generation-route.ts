import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { AttachmentApplicationError } from '@prodactionpro/chat-application';
import { readAuthServerConfig } from '@/shared/auth/config';
import { readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { apiError } from '@/shared/api/api-error';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/core/provider-connection-errors';
import { GenerationIdempotencyConflictError } from '@/entities/generation/server/generation-orchestrator';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';
import { WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';
import { ChatAccessError } from '@prodactionpro/chat-server-core';
import { resolveChatPrincipal } from './auth';
import { HomeVideoGenerationError } from '../contracts/home-video-generation';
import { restoreHomeVideoGenerations, submitHomeVideoGeneration } from './home-video-generation-service';

export async function postHomeVideoGeneration(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) {
    return apiError('forbidden', 'Обновите страницу и попробуйте снова.', 403);
  }
  try {
    const principal = await resolveChatPrincipal(request);
    const result = await submitHomeVideoGeneration(principal, await readBoundedJsonObject(request, 96 * 1024));
    return Response.json(result, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}

export async function getHomeVideoGenerations(request: Request) {
  try {
    const principal = await resolveChatPrincipal(request);
    const conversationId = new URL(request.url).searchParams.get('conversationId');
    if (!conversationId || conversationId.length > 160) return apiError('invalid_conversation', 'Откройте разговор ещё раз.', 400);
    return Response.json({ jobs: await restoreHomeVideoGenerations(principal, conversationId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}

function routeError(error: unknown) {
  if (error instanceof HomeVideoGenerationError) return apiError(error.code, error.message, error.statusCode);
  if (error instanceof MemberBudgetError) return apiError(error.code, error.message, error.status);
  if (error instanceof WorkspaceAccessError) return apiError('forbidden', 'Нет доступа к этому пространству. Выберите доступное пространство.', 403);
  if (error instanceof ChatAccessError) return error.code === 'unauthorized'
    ? apiError('unauthorized', 'Войдите в аккаунт ещё раз, чтобы продолжить.', 401)
    : apiError('forbidden', 'Разговор недоступен. Откройте свой разговор в текущем пространстве.', 403);
  if (error instanceof ProviderConnectionNotConfiguredError) {
    return apiError(error.code, error.message, 422);
  }
  if (error instanceof AttachmentApplicationError) return apiError('invalid_attachment', 'Референс недоступен. Прикрепите изображение ещё раз.', 422);
  if (error instanceof GenerationIdempotencyConflictError) return apiError('generation_conflict', 'Этот запрос уже отправлен с другими параметрами. Начните новое сообщение.', 409);
  const response = createRouteErrorResponse(error);
  return response.status >= 500
    ? apiError('home_video_unavailable', 'Не удалось подтвердить запуск видео. Обновите разговор и проверьте его историю перед новой попыткой.', 503)
    : response;
}
