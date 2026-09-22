import { and, asc, eq } from 'drizzle-orm';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { createChatEvent, CHAT_EVENT_TYPES } from '@prodactionpro/chat-protocol';
import { getGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { homeChatGeneration } from './home-chat-schema';
import { requireHomeConversation, isUniqueViolation } from './home-conversation-service';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { toHomeGenerationResult } from './home-generation-service';
import type { HomeGenerationRecord } from './home-chat-schema';

export async function restoreHomeGenerationJobs(principal: ChatPrincipal, conversationId: string,
  recoverEnqueue?: (record: HomeGenerationRecord) => Promise<void>) {
  await requireHomeConversation(principal, conversationId);
  const records = await getDb().select().from(homeChatGeneration).where(and(
    eq(homeChatGeneration.conversationId, conversationId), eq(homeChatGeneration.userId, principal.userId),
    eq(homeChatGeneration.workspaceId, principal.tenantId!),
  )).orderBy(asc(homeChatGeneration.createdAt));
  const { store, eventBus } = getChatConversationInfrastructure();
  const existingMessages = new Set((await store.listMessages(conversationId)).map((message) => message.id));
  const results = [];
  for (const record of records) {
    // Recover a process interruption after durable enqueue but before the binding write.
    if (!record.jobId) {
      const [queued] = await getDb().select({ id: generationJob.id, requestObjectKey: generationJob.requestObjectKey,
        enqueuedAt: generationJob.enqueuedAt }).from(generationJob).where(and(
        eq(generationJob.workspaceId, record.workspaceId), eq(generationJob.createdByUserId, record.userId),
        eq(generationJob.idempotencyKey, `home-image:${record.id}`),
      )).limit(1);
      if (!queued) continue;
      if (!queued.requestObjectKey || !queued.enqueuedAt) {
        // The existing job proves that the proposal was confirmed. Resume its payload,
        // never bind an incomplete enqueue as if it were already runnable.
        if (!recoverEnqueue) continue;
        await recoverEnqueue(record);
      }
      record.jobId = queued.id;
      await getDb().update(homeChatGeneration).set({ jobId: queued.id }).where(eq(homeChatGeneration.id, record.id));
    }
    const job = await getGenerationJob(principal.userId, record.jobId);
    const result = toHomeGenerationResult(record, job);
    if (result.assetId) {
      // Deleted files must not be resurrected or exposed by restored chat history.
      const asset = await getAssetMetadata(principal.userId, result.assetId).catch(() => undefined);
      if (!asset || asset.workspaceId !== principal.tenantId || asset.status !== 'ready') {
        result.assetId = undefined; result.contentUrl = undefined;
      }
    }
    results.push(result);
    if (job.status !== 'succeeded' || !result.contentUrl) continue;
    const id = `home-generation:${job.id}`;
    if (existingMessages.has(id)) continue;
    const message: ChatMessage = {
      id, conversationId, role: 'assistant', createdAt: job.finishedAt ?? job.updatedAt,
      blocks: [{ type: 'image', url: result.contentUrl, alt: record.input.prompt, caption: 'Изображение готово и сохранено в Library.' }],
      metadata: { source: 'home-generation', generationJobId: job.id, assetId: result.assetId, animate: false },
    };
    try { await store.appendMessage(message); } catch (error) { if (isUniqueViolation(error)) continue; throw error; }
    const envelope = createChatEvent({ conversationId, data: message, emittedAt: message.createdAt,
      eventId: id, sequence: 0, type: CHAT_EVENT_TYPES.messageCompleted });
    const { data: _data, type: _type, ...meta } = envelope;
    await eventBus.publish(conversationId, { event: 'message', data: message, meta }).catch(() => undefined);
  }
  return results;
}
