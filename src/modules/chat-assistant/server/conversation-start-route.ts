import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { readAuthServerConfig } from '@/shared/auth/config';
import { resolveChatPrincipal } from './auth';
import { createHomeConversation } from './home-conversation-service';
import { ensureDocumentConversation } from './document-conversation-service';
import { restoreStoryConversation } from './story-conversation';
import { restoreTimelineConversation } from './timeline-conversation';

const inputSchema = z.object({
  target: z.discriminatedUnion('kind', [z.object({ kind: z.literal('home') }),
    z.object({ kind: z.enum(['flow', 'story', 'timeline']), id: z.string().uuid() })]),
  requestId: z.string().uuid(), message: z.string().max(100_000), hasAttachments: z.boolean().default(false),
}).refine((input) => Boolean(input.message.trim()) || input.hasAttachments);

export async function postConversationStart(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return Response.json({ error: 'Обновите страницу.' }, { status: 403 });
    const principal = await resolveChatPrincipal(request);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'Добавьте сообщение или материалы.' }, { status: 400 });
    const { target, requestId } = parsed.data;
    const conversationId = target.kind === 'home'
      ? (await createHomeConversation(principal, `home:${createHash('sha256').update(JSON.stringify([
        principal.productId, principal.tenantId, principal.userId, requestId,
      ])).digest('hex')}`)).id
      : target.kind === 'flow' ? await ensureDocumentConversation(principal, target.id)
        : target.kind === 'story' ? await restoreStoryConversation(principal, target.id)
          : await restoreTimelineConversation(principal, target.id);
    return Response.json({ conversationId }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
