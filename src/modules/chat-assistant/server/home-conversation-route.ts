import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { resolveChatPrincipal } from './auth';
import { restoreHomeConversation } from './home-conversation-service';
import { restoreHomeGenerationJobs } from './home-generation-history';
import { selectedHomeMode } from './home-conversation-mode';
import { getChatAssistantComposition } from './composition';
import { HOME_GENERATE_IMAGE_TOOL } from '../contracts/home-generation';

export async function getHomeConversationRoute(request: Request) {
  try {
    const principal = await resolveChatPrincipal(request);
    const selected = new URL(request.url).searchParams.get('conversationId') ?? undefined;
    if (selected && selected.length > 160) return Response.json({ error: 'Разговор недоступен.' }, { status: 400 });
    const conversation = await restoreHomeConversation(principal, selected);
    if (!conversation) return Response.json({ selectedMode: 'image-generation', jobs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    const jobs = await restoreHomeGenerationJobs(principal, conversation.id, async (record) => {
      const { homeGeneration } = await getChatAssistantComposition();
      const result = await homeGeneration.execute({ toolName: HOME_GENERATE_IMAGE_TOOL, riskLevel: 'write',
        input: record.input, executionRef: record.id }, { ...principal, conversationId: record.conversationId,
        toolCallId: record.toolCallId, turnId: record.sourceTurnId });
      if (!result.ok) throw new Error('Не удалось восстановить задание. Повторите загрузку.');
    });
    return Response.json({ conversationId: conversation.id, selectedMode: await selectedHomeMode(conversation.id), jobs },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return createRouteErrorResponse(error); }
}
