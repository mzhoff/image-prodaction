import { z } from 'zod';
import { readAuthServerConfig } from '@/shared/auth/config';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';
import {
  getMemberBudgets,
  updateMemberBudget,
} from '@/modules/workspace-budgets/server/member-budget-service';

const policy = z
  .object({
    userId: z.string().min(1).max(200),
    enabled: z.boolean(),
    limitUsd: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,8})?$/)
      .nullable(),
    period: z.enum(['lifetime', 'month']),
    revision: z.number().int().min(0).max(2147483646),
  })
  .strict();
const dependencies = {
  session: async (request: Request): Promise<{ user: { id: string } } | null> => {
    const { getRequestSession } = await import('@/modules/authentication/server/auth-session');
    return getRequestSession(request);
  },
  read: getMemberBudgets,
  update: updateMemberBudget,
  origins: () => readAuthServerConfig().trustedOrigins,
};
export async function handleMemberBudgets(request: Request, workspaceId: string, ports = dependencies) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!z.string().uuid().safeParse(workspaceId).success)
      throw new MemberBudgetError('invalid_workspace', 'Некорректное пространство.', 400);
    if (!['GET', 'PATCH'].includes(request.method)) return json({ message: 'Метод не поддерживается.' }, 405);
    if (request.method === 'PATCH' && !ports.origins().includes(request.headers.get('origin') ?? '')) {
      throw new MemberBudgetError('invalid_origin', 'Источник запроса не разрешён.', 403);
    }
    const session = await ports.session(request);
    if (!session?.user.id) throw new MemberBudgetError('unauthorized', 'Войдите в аккаунт.', 401);
    if (request.method === 'PATCH') {
      const body = policy.parse(await readBody(request));
      const { userId, ...input } = body;
      await ports.update(session.user.id, workspaceId, userId, { ...input, mode: 'observed' });
    }
    return json(await ports.read(session.user.id, workspaceId));
  } catch (error) {
    if (error instanceof MemberBudgetError)
      return json({ code: error.code, message: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ message: 'Проверьте настройки лимита.' }, 400);
    return json(
      { message: 'Не удалось получить или сохранить лимиты. Обновите данные и попробуйте ещё раз.' },
      503,
    );
  }
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('body_required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new MemberBudgetError('request_too_large', 'Запрос слишком большой.', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    reader.releaseLock();
  }
}
