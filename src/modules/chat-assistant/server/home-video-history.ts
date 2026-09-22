import type { ConversationEventBus, ConversationStore } from '@prodactionpro/chat-application';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import { createChatEvent, CHAT_EVENT_TYPES } from '@prodactionpro/chat-protocol';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import { isUniqueViolation } from './home-conversation-service';
import { homeVideoFailureMessage } from '../contracts/home-video-errors';
import { homeVideoIntentSchema } from '@/shared/media/home-video-intent';

export function toHomeVideoResult(job: GenerationJobDto, request: VideoGenerationRequest) {
  const intent = readVideoIntent(job);
  return { jobId: job.id, mediaKind: 'video' as const, status: job.cancelRequestedAt && job.status === 'running' ? 'canceled' : job.status,
    assetId: job.finalAssetId ?? undefined, contentUrl: job.finalAssetId ? `/api/assets/${job.finalAssetId}/content` : undefined,
    statusUrl: `/api/generation-jobs/${job.id}`, prompt: originalVideoPrompt(job, request), compiledPrompt: request.prompt,
    ...(intent ? { intent } : {}), model: request.model,
    subjects: videoSubjectSummary(job),
    aspectRatio: request.aspectRatio, size: request.resolution, duration: request.duration,
    createdAt: job.createdAt, error: job.error ? { ...job.error, message: homeVideoFailureMessage(job.error.code, job.error.retryable) } : undefined };
}

export async function persistHomeVideoMessages(job: GenerationJobDto, conversationId: string, request: VideoGenerationRequest,
  store: Pick<ConversationStore, 'listMessages' | 'appendMessage'>, eventBus: Pick<ConversationEventBus, 'publish'>) {
  const existing = new Set((await store.listMessages(conversationId)).map((message) => message.id));
  const userMessageId = `home-video-user:${job.id}`;
  const intent = readVideoIntent(job);
  const originalPrompt = originalVideoPrompt(job, request);
  const images = [request.firstFrame, request.lastFrame, ...request.references].filter((image) => image !== undefined);
  const messages: ChatMessage[] = [
    { id: userMessageId, conversationId, role: 'user', createdAt: job.createdAt,
      blocks: [{ type: 'text', content: originalPrompt }, ...images.map((image) => ({ type: 'image' as const,
        url: `/api/assets/${image.assetId}/content`, alt: 'Референс видео' }))],
      metadata: { mode: 'general-chat', homeComposerMode: 'video', source: 'home-video', generationJobId: job.id,
        ...(intent ? { originalPrompt, compiledPrompt: request.prompt, homeVideoIntent: intent } : {}),
        ...(Array.isArray(job.metadata?.homeVideoSubjects) ? { homeVideoSubjects: job.metadata.homeVideoSubjects } : {}) } },
    { id: `home-video-assistant:${job.id}`, conversationId, role: 'assistant', createdAt: job.createdAt,
      blocks: [{ type: 'text', content: 'Запрос на создание видео принят. Статус и результат доступны в карточке генерации.' }],
      metadata: { source: 'home-generation', mediaKind: 'video', generationJobId: job.id, animate: false } },
  ];
  for (const message of messages) {
    if (existing.has(message.id)) continue;
    try { await store.appendMessage(message); } catch (error) { if (isUniqueViolation(error)) continue; throw error; }
    const envelope = createChatEvent({ conversationId, data: message, emittedAt: message.createdAt,
      eventId: message.id, sequence: 0, type: CHAT_EVENT_TYPES.messageCompleted });
    const { data: _data, type: _type, ...meta } = envelope;
    try { await eventBus.publish(conversationId, { event: 'message', data: message, meta }); }
    catch { /* Durable history is reloaded if live delivery is temporarily unavailable. */ }
  }
  return userMessageId;
}

function originalVideoPrompt(job: GenerationJobDto, request: VideoGenerationRequest) {
  return typeof job.metadata?.originalPrompt === 'string' ? job.metadata.originalPrompt : request.prompt;
}
function readVideoIntent(job: GenerationJobDto) {
  const parsed = homeVideoIntentSchema.safeParse(job.metadata?.homeVideoIntent);
  return parsed.success ? parsed.data : undefined;
}
function videoSubjectSummary(job: GenerationJobDto) {
  const subjects = job.metadata?.homeVideoSubjects;
  return Array.isArray(subjects) ? subjects.flatMap((subject: unknown) => {
    if (!subject || typeof subject !== 'object' || !('id' in subject) || typeof subject.id !== 'string'
      || !('name' in subject) || typeof subject.name !== 'string') return [];
    return [{ id: subject.id, name: subject.name }];
  }) : [];
}
