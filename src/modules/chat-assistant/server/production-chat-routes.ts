import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { readAuthServerConfig } from '@/shared/auth/config';
import { isUuid } from '@/shared/lib/id';
import { chatChangeSchema } from '../contracts/production-chats';
import { resolveChatPrincipal } from './auth';
import { changeProductionChat, listProductionChats } from './production-chat-service';

export async function getProductionChats(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const folderId = params.get('folderId') || undefined;
    if (folderId && !isUuid(folderId)) return Response.json({ error: 'Проект недоступен.' }, { status: 400 });
    const limit = Math.max(1, Math.min(200, Number(params.get('limit')) || 200));
    const offset = Math.max(0, Math.min(100_000, Number(params.get('offset')) || 0));
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) return Response.json({ error: 'Неверная страница.' }, { status: 400 });
    const items = await listProductionChats(await resolveChatPrincipal(request), {
      status: params.get('status') ?? undefined, folderId, query: (params.get('q') ?? '').slice(0, 120),
      limit: limit + 1, offset,
    });
    return Response.json({ items: items.slice(0, limit), hasMore: items.length > limit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
export async function patchProductionChat(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return Response.json({ error: 'Обновите страницу.' }, { status: 403 });
    const { id } = await context.params;
    const body = chatChangeSchema.safeParse(await request.json().catch(() => null));
    if (!body.success || !id || id.length > 160) return Response.json({ error: 'Проверьте название или выбранный проект.' }, { status: 400 });
    await changeProductionChat(await resolveChatPrincipal(request), id, body.data);
    return Response.json({ ok: true });
  } catch (error) { return createRouteErrorResponse(error); }
}
