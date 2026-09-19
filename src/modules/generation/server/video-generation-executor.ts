import { withPaidCredential } from '@/modules/provider-connections/server/paid-request-guard';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getGeneratedAssetByJobId } from '@/entities/asset/server/asset-service';
import { persistAuthorizedVideoAsset } from '@/entities/asset/server/video-asset-service';
import { createOpenRouterVideoAdapter } from '@/modules/provider-connections/adapters/openrouter-video-adapter';
import { loadVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';
import { resolveOpenRouterCredentialForWorkspace, markOpenRouterProviderUsed } from '@/modules/provider-connections/server/provider-connection-service';
import type { ProviderResult } from '@/modules/provider-connections';
import { inspectVideoBytes } from '@/shared/media/video-processor';
import { MAX_VIDEO_OUTPUT_BYTES } from '@/shared/media/video-contracts';
import { validateVideoRequest, videoRequestSchema, VIDEO_GENERATION_TIMEOUT_MS } from '@/shared/media/video-generation-contracts';
import { assertActiveGenerationAttempt, getGenerationExecutionRecord, markProviderCallDispatched } from './generation-execution-repository';
import { saveAcceptedVideoOperationId, saveVideoProviderDiagnostic } from './video-operation-checkpoint';
import { VideoProviderError } from '@/modules/provider-connections/core/video-provider-error';
import { createGenerationPayloadStore } from './generation-payload-store';
import { recordUsageEventWithRetry, usageMissingFromJobLedger } from './generation-usage-recorder';
import { GenerationExecutionError, type GenerationExecutor } from './generation-worker';
import { prepareVideoInputs, type QueuedVideoPayload } from './video-generation-input';

const defaults = {
  adapter: createOpenRouterVideoAdapter(), readRecord: getGenerationExecutionRecord,
  active: assertActiveGenerationAttempt, findAsset: getGeneratedAssetByJobId,
  readPayload: (key: string) => createGenerationPayloadStore().read<QueuedVideoPayload>(key),
  credential: resolveOpenRouterCredentialForWorkspace, catalog: loadVideoCatalog, prepare: prepareVideoInputs,
  dispatch: markProviderCallDispatched, saveOperation: saveAcceptedVideoOperationId, markUsed: markOpenRouterProviderUsed,
  diagnostic: saveVideoProviderDiagnostic,
  recordUsage: recordUsageEventWithRetry, inspect: inspectVideoBytes, persist: persistAuthorizedVideoAsset,
  wait: (signal: AbortSignal) => delay(15_000, undefined, { signal }), now: Date.now,
};
export function createVideoGenerationExecutor(overrides: Partial<typeof defaults> = {}): GenerationExecutor {
  const dependencies = { ...defaults, ...overrides };
  const { adapter } = dependencies;
  return { async execute({ job, signal }) {
    const record = await dependencies.readRecord(job.id);
    const active = () => dependencies.active(job.id, job.attemptCount, signal);
    await active();
    if (job.operation !== 'generate_video' || !job.requestObjectKey) throw failure('video_payload_missing', 'Запрос видео отсутствует.');
    const existing = await dependencies.findAsset(job.id);
    if (existing && (existing.workspaceId !== job.workspaceId || existing.mediaKind !== 'video')) throw failure('video_result_scope', 'Результат принадлежит другому пространству или имеет неверный тип.');
    const payload = await dependencies.readPayload(job.requestObjectKey);
    if (payload.workspaceId !== job.workspaceId || payload.documentId !== job.documentId
      || payload.request.model !== (record.metadata?.modelKey ?? job.modelId) || !record.createdByUserId
      || createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== record.metadata?.requestHash) throw failure('video_payload_scope', 'Запрос видео не соответствует сохранённому заданию.');
    payload.request = videoRequestSchema.parse(payload.request);
    const credential = await dependencies.credential(job.workspaceId);
    return withPaidCredential(credential.apiKey, async () => {
    const context = { credential: credential.apiKey, signal,
      redactions: [payload.request.prompt, ...payload.request.references.map((ref) => ref.description)] };
    let operationId = record.providerOperationId;
    const startedAt = record.providerDispatchedAt?.getTime() ?? dependencies.now();
    if (!operationId) {
      if (record.providerDispatchedAt) throw failure('provider_outcome_unknown', 'Предыдущий запрос отправлен, но его ID не сохранён. Автоповтор заблокирован, чтобы избежать двойной оплаты. Проверьте историю OpenRouter.');
      const model = (await dependencies.catalog()).find((candidate) => candidate.key === payload.request.model);
      const error = validateVideoRequest(payload.request, model);
      if (error) throw failure('invalid_video_request', error);
      if (model!.route.gateway !== job.provider || model!.route.modelId !== job.modelId) throw failure('video_route_changed', 'Маршрут модели изменился после создания задания. Запрос поставщику не отправлен.');
      const prepared = await dependencies.prepare(payload, record.createdByUserId, signal);
      await active();
      await dependencies.dispatch(job.id, job.attemptCount);
      try {
        const accepted = await adapter.submit({ ...prepared, model: job.modelId }, context);
        operationId = accepted.operationId;
        await dependencies.saveOperation({ jobId: job.id, attemptCount: job.attemptCount, providerOperationId: operationId });
      } catch (error) {
        if (error instanceof VideoProviderError) {
          await dependencies.diagnostic({ jobId: job.id, attemptCount: job.attemptCount, stage: 'submit', diagnostic: error.diagnostic });
          if (error.rejectionConfirmed) throw failure(error.diagnostic.code, error.message);
        }
        throw failure('video_submit_unconfirmed', 'Не удалось подтвердить отправку видео. Проверьте историю поставщика перед новой попыткой. Автоповтор не выполняется.');
      }
      await dependencies.markUsed(credential.connection.id).catch(() => undefined);
    }
    try {
      while (dependencies.now() - startedAt < VIDEO_GENERATION_TIMEOUT_MS) {
        await active();
        const status = await adapter.poll(operationId, context);
        if (status.status === 'pending' || status.status === 'in_progress') {
          await dependencies.wait(signal); continue;
        }
        const result: ProviderResult = { provider: 'openrouter', modelId: job.modelId,
          providerOperationId: status.generationId ?? operationId, outputs: [], usage: status.usage,
          metadata: { videoOperationId: operationId } };
        await dependencies.recordUsage({ generationJobId: job.id,
          attemptCount: record.providerDispatchedAttempt ?? job.attemptCount,
          succeeded: status.status === 'completed', providerCostUsd: status.usage.providerCostUsd,
          providerOperationId: status.generationId ?? operationId, inputTokens: null, outputTokens: null, totalTokens: null,
          metadata: { videoOperationId: operationId, videoStatus: status.status },
        }, status.usage);
        if (status.status !== 'completed') {
          if (status.failure) await dependencies.diagnostic({ jobId: job.id, attemptCount: job.attemptCount, stage: 'poll', diagnostic: status.failure });
          throw new GenerationExecutionError({ code: status.failure?.code ?? `video_${status.status}`,
            message: status.failure?.message ?? `Поставщик завершил видео со статусом ${status.status}. Новый платный запрос не отправлен.`, retryable: false,
            usage: usageMissingFromJobLedger(record, result) });
        }
        if (existing?.status === 'ready') return { assetId: existing.id, usage: usageMissingFromJobLedger(record, result) };
        const bytes = await adapter.download(operationId, context);
        const inspected = await dependencies.inspect(bytes, { maxBytes: MAX_VIDEO_OUTPUT_BYTES, maxDurationSeconds: 35, signal });
        await active();
        const asset = await dependencies.persist({ bytes, signal, maxBytes: MAX_VIDEO_OUTPUT_BYTES,
          workspaceId: job.workspaceId, documentId: job.documentId, userId: record.createdByUserId,
          generationJobId: job.id, operation: 'generate_video', origin: 'generated', libraryVisible: true,
          originalName: `video-${job.id}.${inspected.extension}`, modelId: job.modelId, provider: 'openrouter',
          metadata: { videoOperationId: operationId, duration: payload.request.duration, mode: payload.request.mode },
        }, inspected);
        return { assetId: asset.id, usage: usageMissingFromJobLedger(record, result) };
      }
      throw failure('video_wait_timeout', 'Истекло окно ожидания 45 минут. Поставщик мог продолжить работу; проверьте его историю перед новым платным запросом.');
    } catch (error) {
      if (error instanceof GenerationExecutionError) throw error;
      if (error instanceof VideoProviderError) {
        await dependencies.diagnostic({ jobId: job.id, attemptCount: job.attemptCount, stage: 'poll', diagnostic: error.diagnostic });
        if (error.rejectionConfirmed && error.diagnostic.httpStatus !== 429) throw failure(error.diagnostic.code, error.message);
      }
      // A durable provider ID exists: retry polls/downloads that ID, never POSTs again.
      throw new GenerationExecutionError({ code: 'video_recovery_required',
        message: 'Проверка или сохранение видео прервались. Повтор проверит то же задание без повторной генерации.', retryable: true });
    }
    });
  } };
}
function failure(code: string, message: string) { return new GenerationExecutionError({ code, message, retryable: false }); }
