import { z } from 'zod';
import { readAuthServerConfig } from '@/shared/auth/config';
const inputSchema = z.object({
  analyticsContext: z.object({ clientId: z.string().regex(/^\d{1,32}$/) }).optional().catch(undefined),
  requestId: z.string().uuid(), workspaceId: z.string().uuid(),
  plan: z.enum(['start', 'creator', 'studio']),
  amountUsd: z.number().int().min(10).max(200),
}).strict();
const messages: Record<string, string> = {
  TELEGRAM_LINK_REQUIRED: 'Сначала привяжите Telegram в настройках аккаунта, затем повторите попытку.',
  IDENTITY_LINK_REQUIRED: 'Войдите через Telegram, чтобы передать заявку в бот.',
  WORKSPACE_OWNER_REQUIRED: 'Пополнение может оформить владелец пространства.',
  HANDOFF_ALREADY_PENDING: 'В боте уже ожидается квитанция по другой заявке. Завершите или отмените её, затем повторите выбор.',
  HANDOFF_CONFLICT: 'Выбор изменился. Закройте окно пополнения и откройте его заново.',
  HANDOFF_CLOSED: 'Эта заявка уже закрыта. Закройте окно пополнения и создайте новую.',
};
const defaults = {
  origins: () => readAuthServerConfig().trustedOrigins,
  session: async (request: Request): Promise<{ user: { id: string } } | null> => {
    const { getRequestSession } = await import('@/modules/authentication/server/auth-session');
    return getRequestSession(request);
  },
  send: async (userId: string, input: z.infer<typeof inputSchema>) => {
    const { requestTelegramHandoff } = await import('@/modules/provider-connections/server/platform/telegram-handoff');
    return requestTelegramHandoff(userId, input);
  },
};
export async function handleTelegramHandoff(request: Request, ports = defaults) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ message: 'Метод не поддерживается.' }, 405);
  if (!ports.origins().includes(request.headers.get('origin') ?? '')) return json({ message: 'Обновите страницу и повторите попытку.' }, 403);
  try {
    const session = await ports.session(request);
    if (!session) return json({ message: 'Войдите в аккаунт и повторите попытку.' }, 401);
    const reader = request.body?.getReader();
    if (!reader) return json({ message: 'Выберите сумму пополнения.' }, 400);
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4096) { await reader.cancel(); return json({ message: 'Запрос слишком большой.' }, 413); }
      chunks.push(value);
    }
    const input = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!input.success) return json({ message: 'Проверьте пространство и сумму пополнения.' }, 400);
    return json(await ports.send(session.user.id, input.data));
  } catch (error) {
    const e = error as { code?: string; status?: number; name?: string };
    if (e.name === 'WorkspaceAccessError') return json({ message: messages.WORKSPACE_OWNER_REQUIRED }, 403);
    if (error instanceof SyntaxError) return json({ message: 'Проверьте сумму пополнения.' }, 400);
    return json({ message: e.code && messages[e.code] || 'Не удалось подготовить сообщение бота. Попробуйте ещё раз — повторного начисления не будет.' }, e.status === 409 ? 409 : e.status === 403 ? 403 : 503);
  }
}

export async function POST(request: Request) {
  return handleTelegramHandoff(request);
}
