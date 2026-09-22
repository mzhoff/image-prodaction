import { createHash } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getGenerationJob, type GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { loadVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';
import { submitGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { validateVideoAssets, type QueuedVideoPayload } from '@/modules/generation/server/video-generation-input';
import { validateVideoRequest, videoRequestSchema } from '@/shared/media/video-generation-contracts';
import { homeVideoGenerationSchema, HomeVideoGenerationError } from '../contracts/home-video-generation';
import { requireHomeConversation } from './home-conversation-service';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { materializeHomeVideoAttachments } from './home-video-attachments';
import { persistHomeVideoMessages, toHomeVideoResult } from './home-video-history';
import { planHomeVideoInput } from './home-video-intent-adapter';
import { applyHomeVideoSubjects, snapshotHomeVideoSubjects } from './home-video-direction-subjects';

const defaults = {
  requireConversation: requireHomeConversation, credential: resolveOpenRouterCredential, catalog: loadVideoCatalog,
  submit: submitGenerationJob, validateAssets: validateVideoAssets,
  subjects: snapshotHomeVideoSubjects,
  async materialize(principal: ChatPrincipal, ids: string[], request: QueuedVideoPayload['request']) {
    const { getChatAssistantComposition } = await import('./composition');
    return materializeHomeVideoAttachments(principal, ids, request, (await getChatAssistantComposition()).attachmentService);
  },
  async findJob(principal: ChatPrincipal, key: string) {
    const [row] = await getDb().select({ id: generationJob.id }).from(generationJob).where(and(
      eq(generationJob.workspaceId, principal.tenantId!), eq(generationJob.createdByUserId, principal.userId),
      eq(generationJob.idempotencyKey, key),
    )).limit(1);
    return row ? getGenerationJob(principal.userId, row.id) : undefined;
  },
  async persist(job: GenerationJobDto, conversationId: string, request: QueuedVideoPayload['request']) {
    const { store, eventBus } = getChatConversationInfrastructure();
    return persistHomeVideoMessages(job, conversationId, request, store, eventBus);
  },
};

export async function submitHomeVideoGeneration(principal: ChatPrincipal, raw: unknown, dependencies = defaults) {
  const parsed = homeVideoGenerationSchema.safeParse(raw);
  if (!parsed.success) throw new HomeVideoGenerationError('Проверьте описание и параметры видео.');
  const input = parsed.data;
  if (input.workspaceId !== principal.tenantId) throw new HomeVideoGenerationError('Выберите текущее рабочее пространство.', 403);
  await dependencies.requireConversation(principal, input.conversationId);
  if (!input.request.prompt.trim()) throw new HomeVideoGenerationError('Добавьте текстовое задание для видеофрагмента.');
  const plan = planHomeVideoInput(principal, input);
  const idempotencyKey = `home-video:${hash([principal.productId, principal.userId, input.conversationId, input.idempotencyKey])}`;
  const submissionHash = hash(input);
  const existing = await dependencies.findJob(principal, idempotencyKey);
  let videoRequest = input.request;
  let job: GenerationJobDto;
  if (existing) {
    if (existing.metadata?.homeSubmissionHash !== submissionHash || existing.metadata?.conversationId !== input.conversationId) {
      throw new HomeVideoGenerationError('Этот запрос уже отправлен с другими параметрами. Начните новое сообщение.', 409);
    }
    videoRequest = videoRequestSchema.parse(existing.metadata.videoRequest);
    job = existing;
    if (!existing.requestObjectKey || !existing.enqueuedAt) {
      // Only complete the same authorized enqueue. Existing provider jobs are never recreated.
      const payload: QueuedVideoPayload = { workspaceId: input.workspaceId, documentId: null,
        homeConversationId: input.conversationId, request: videoRequest };
      job = await dependencies.submit({ userId: principal.userId, workspaceId: input.workspaceId, documentId: null,
        operation: 'generate_video', provider: existing.provider, modelId: existing.modelId, maxAttempts: existing.maxAttempts,
        idempotencyKey, payload, metadata: existing.metadata });
    }
  } else {
    await dependencies.credential(principal.userId, input.workspaceId);
    const model = (await dependencies.catalog()).find((candidate) => candidate.key === input.request.model);
    if (!model) throw new HomeVideoGenerationError('Выберите модель из актуального каталога видео.');
    const subjects = await dependencies.subjects(principal, input.intent?.direction?.story.subjectIds ?? []);
    const preflightError = validateVideoRequest(applyHomeVideoSubjects(plan.candidate, subjects), model);
    if (preflightError) throw new HomeVideoGenerationError(preflightError);
    videoRequest = applyHomeVideoSubjects(plan.finalize(await dependencies.materialize(principal, plan.attachmentIds, plan.materializationRequest)), subjects);
    const error = validateVideoRequest(videoRequest, model);
    if (error) throw new HomeVideoGenerationError(error);
    await dependencies.validateAssets(videoRequest, principal.userId, input.workspaceId);
    const payload: QueuedVideoPayload = { workspaceId: input.workspaceId, documentId: null,
      homeConversationId: input.conversationId, request: videoRequest };
    const metadata = { source: 'home-chat', conversationId: input.conversationId,
      homeSubmissionHash: submissionHash, videoRequest, modelKey: videoRequest.model, mode: videoRequest.mode,
      ...(input.intent ? { originalPrompt: input.request.prompt, homeVideoIntent: input.intent } : {}),
      ...(subjects.length ? { homeVideoSubjects: subjects } : {}),
      requestHash: hash(payload) };
    if (JSON.stringify(metadata).length > 32_768) throw new HomeVideoGenerationError('Сократите описание видео и референсов.');
    job = await dependencies.submit({ userId: principal.userId, workspaceId: input.workspaceId, documentId: null,
      operation: 'generate_video', provider: model.route.gateway, modelId: model.route.modelId, maxAttempts: 3,
      idempotencyKey, payload, metadata });
  }
  const userMessageId = await dependencies.persist(job, input.conversationId, videoRequest);
  return { result: toHomeVideoResult(job, videoRequest), userMessageId };
}

export async function restoreHomeVideoGenerations(principal: ChatPrincipal, conversationId: string) {
  await requireHomeConversation(principal, conversationId);
  const rows = await getDb().select({ id: generationJob.id }).from(generationJob).where(and(
    eq(generationJob.workspaceId, principal.tenantId!), eq(generationJob.createdByUserId, principal.userId),
    eq(generationJob.operation, 'generate_video'), sql`${generationJob.metadata}->>'source' = 'home-chat'`,
    sql`${generationJob.metadata}->>'conversationId' = ${conversationId}`,
  )).orderBy(asc(generationJob.createdAt));
  const jobs = [];
  for (const row of rows) {
    let job = await getGenerationJob(principal.userId, row.id);
    const parsed = videoRequestSchema.safeParse(job.metadata?.videoRequest);
    if (!parsed.success) continue;
    if (job.status === 'queued' && (!job.requestObjectKey || !job.enqueuedAt)) {
      const payload: QueuedVideoPayload = { workspaceId: principal.tenantId!, documentId: null,
        homeConversationId: conversationId, request: parsed.data };
      if (hash(payload) !== job.metadata?.requestHash) continue;
      job = await submitGenerationJob({ userId: principal.userId, workspaceId: principal.tenantId!, documentId: null,
        operation: 'generate_video', provider: job.provider, modelId: job.modelId, maxAttempts: job.maxAttempts,
        idempotencyKey: job.idempotencyKey, payload, metadata: job.metadata });
    }
    const result = toHomeVideoResult(job, parsed.data);
    if (result.assetId) {
      const asset = await getAssetMetadata(principal.userId, result.assetId).catch(() => undefined);
      if (!asset || asset.workspaceId !== principal.tenantId || asset.status !== 'ready' || asset.mediaKind !== 'video') {
        result.assetId = undefined; result.contentUrl = undefined;
      }
    }
    await defaults.persist(job, conversationId, parsed.data);
    jobs.push(result);
  }
  return jobs;
}

function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
