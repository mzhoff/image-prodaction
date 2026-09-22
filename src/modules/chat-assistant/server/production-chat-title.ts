import { and, eq, inArray } from 'drizzle-orm';
import type { ToolCallingLanguageModelGateway } from '@prodactionpro/chat-connectors';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getDb } from '@/shared/db/client';
import { intentChatTitle, PRODUCTION_CHAT_TITLE_INSTRUCTION, takeProductionChatTitle } from '../core/production-chat-title';
import { productionChat } from './production-chat-schema';
import { assertProductionChatWritable, type ProductionChatDatabase } from './production-chat-service';

/** The title shares the normal accounted model request. Never starts an extra paid call. */
export function withProductionChatTitle(gateway: ToolCallingLanguageModelGateway, principal: ChatPrincipal, id: string, db: ProductionChatDatabase = getDb()): ToolCallingLanguageModelGateway {
  return { completeWithTools: async (input) => {
    await assertProductionChatWritable(principal, id, db);
    await db.insert(productionChat).values({ conversationId: id }).onConflictDoNothing();
    const [metadata] = await db.select().from(productionChat).where(eq(productionChat.conversationId, id));
    const naming = metadata.titleSource === 'pending' || metadata.titleSource === 'intent';
    if (!naming) return gateway.completeWithTools(input);
    if (metadata.titleSource === 'pending') {
      const first = input.messages.find((message) => message.role === 'user');
      const intent = typeof first?.content === 'string' ? first.content : first?.content.filter((part) => part.type === 'text').map((part) => part.text).join(' ') ?? '';
      await db.update(productionChat).set({ title: intentChatTitle(intent), titleSource: 'intent' })
        .where(and(eq(productionChat.conversationId, id), eq(productionChat.titleSource, 'pending')));
    }
    const result = await gateway.completeWithTools({ ...input, messages: [...input.messages, { role: 'system', content: PRODUCTION_CHAT_TITLE_INSTRUCTION }] });
    const parsed = takeProductionChatTitle(result.content);
    if (parsed.title) {
      // A manual rename during the model request always wins. A storage hiccup must not retry paid generation.
      await db.update(productionChat).set({ title: parsed.title, titleSource: 'model', updatedAt: new Date() })
        .where(and(eq(productionChat.conversationId, id), inArray(productionChat.titleSource, ['pending', 'intent'])))
        .catch(() => console.error('[production-chat-title-save-failed]'));
    }
    return { ...result, content: parsed.content };
  } };
}
