'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveAssetScope, getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { GenerateVideoNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';
import { notifyAssistantNotice } from '@/features/assistant-pet/model/assistant-pet-notices';
import { recordDocumentAssistantActivity } from '@/modules/chat-assistant/adapters/client/document-activity-client';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import { isVideoJobTerminal, readVideoJob, submitVideo, videoJobAsset, waitVideoPoll } from '../api/video-generation-api';
import { requestCancelSpeechJob } from '../api/speech-api';
import { getVideoGenerationUserMessage } from '../lib/video-generation-user-message';
import { prepareVideoImages } from '../lib/prepare-video-images';

type Saved = NonNullable<GenerateVideoNodeData['videoRequest']>;
const store = () => useProductionGraphStore.getState();
export function useVideoExecution(nodeId: string, data: GenerateVideoNodeData) {
  const scope = useSyncExternalStore(subscribeActiveAssetScope, getActiveAssetScopeSnapshot, () => undefined);
  const guard = useRef<AbortController | null>(null);
  const resumed = useRef<string | undefined>(undefined);
  const [progress, setProgress] = useState('');
  useEffect(() => () => { guard.current?.abort(); guard.current = null; resumed.current = undefined; }, [nodeId, scope?.workspaceId, scope?.documentId]);
  const execute = useCallback(async (initial: Saved) => {
    if (guard.current || getActiveAssetScope()?.workspaceId !== initial.workspaceId || getActiveAssetScope()?.documentId !== initial.documentId) return;
    const controller = new AbortController(); guard.current = controller;
    let saved = initial;
    const current = () => !controller.signal.aborted && guard.current === controller
      && getActiveAssetScope()?.workspaceId === saved.workspaceId && getActiveAssetScope()?.documentId === saved.documentId
      && (store().nodes.find((node) => node.id === nodeId)?.data as GenerateVideoNodeData | undefined)?.videoRequest?.idempotencyKey === saved.idempotencyKey;
    store().updateNodeDataSilent(nodeId, { videoRequest: saved, message: '' }); store().setNodeStatus(nodeId, 'running');
    try {
      let response = saved.jobId ? await readVideoJob(saved.jobId, controller.signal) : await submitVideo(saved, controller.signal);
      if (!current()) return;
      saved = { ...saved, jobId: response.job.id };
      store().updateNodeDataSilent(nodeId, { videoRequest: saved });
      const deadline = Date.now() + 50 * 60_000;
      while (Date.now() < deadline) {
        if (!current()) return;
        if (response.job.status === 'succeeded') {
          // Submit replay may omit the asset; obtain it from the authorized job route.
          if (!response.asset) response = await readVideoJob(saved.jobId!, controller.signal);
          const asset = videoJobAsset(response);
          if (!current()) return;
          const latest = store().nodes.find((node) => node.id === nodeId)!.data as GenerateVideoNodeData;
          const resultAssetIds = [...new Set([...latest.resultAssetIds, asset.id])];
          store().addAsset(asset);
          store().updateNodeData(nodeId, { resultAssetIds, activeResultIndex: resultAssetIds.length - 1, videoRequest: undefined, message: '' });
          store().setNodeStatus(nodeId, 'success'); setProgress(''); notifyProviderUsageUpdated(saved.workspaceId);
          notifyAssistantNotice({
            id: `video-generated:${asset.id}`,
            status: 'success',
            title: 'Видео готово',
            subtitle: 'Ровер закончил сборку. Открой чат, чтобы найти источник.',
            nodeId,
          });
          void recordDocumentAssistantActivity({
            documentId: saved.documentId,
            workspaceId: saved.workspaceId,
            kind: 'video-generated',
            model: saved.payload.model,
            assetId: asset.id,
            nodeId,
          }).catch(() => undefined);
          return;
        }
        if (isVideoJobTerminal(response)) throw new Error(response.job.error?.message ?? 'Запрос отменён. Уже отправленное поставщику задание может продолжиться и быть оплачено.');
        setProgress(response.job.status === 'queued' ? 'В очереди…' : 'Генерируем и сохраняем видео. Можно закрыть проект — работа продолжится.');
        await waitVideoPoll(controller.signal); response = await readVideoJob(saved.jobId!, controller.signal);
      }
      throw new Error('Видео ещё не получено. Нажмите «Проверить результат» — новый платный запрос не создаётся.');
    } catch (error) {
      if (current()) {
        setProgress('');
        store().setNodeStatus(nodeId, 'error');
        store().updateNodeDataSilent(nodeId, { message: getVideoGenerationUserMessage(error instanceof Error ? error.message : 'Не удалось получить видео.') });
      }
    } finally { if (guard.current === controller) guard.current = null; }
  }, [nodeId]);
  useEffect(() => {
    const saved = data.videoRequest;
    // Resume only acknowledged jobs automatically. Unknown submit is retried explicitly with the same frozen request/key.
    if (!scope || !saved?.jobId || resumed.current === saved.idempotencyKey || guard.current) return;
    resumed.current = saved.idempotencyKey; void execute(saved);
  }, [data.videoRequest, execute, scope]);
  const start = async (payload: VideoGenerationRequest) => {
    const active = getActiveAssetScope();
    const node = store().nodes.find((item) => item.id === nodeId);
    if (!active || guard.current || !node || node.locked || (node.data as GenerateVideoNodeData).videoRequest) return;
    const controller = new AbortController(); guard.current = controller;
    const current = () => !controller.signal.aborted && guard.current === controller
      && getActiveAssetScope()?.workspaceId === active.workspaceId && getActiveAssetScope()?.documentId === active.documentId
      && store().nodes.some((item) => item.id === nodeId && item.type === 'generateVideo');
    store().setNodeStatus(nodeId, 'running');
    store().updateNodeDataSilent(nodeId, { message: '' });
    setProgress('Подготавливаем кадры…');
    try {
      const prepared = await prepareVideoImages(payload, store().assets, active, controller.signal);
      if (!current()) return;
      for (const asset of prepared.uploadedAssets) store().addAsset(asset);
      const saved = { ...active, payload: prepared.request, idempotencyKey: crypto.randomUUID() };
      store().updateNodeDataSilent(nodeId, { videoRequest: saved });
      // No await between releasing preparation's guard and acquiring execution's.
      guard.current = null;
      await execute(saved);
    } catch (error) {
      if (current()) {
        setProgress(''); store().setNodeStatus(nodeId, 'error');
        store().updateNodeDataSilent(nodeId, { message: getVideoGenerationUserMessage(error instanceof Error ? error.message : 'Не удалось подготовить кадры.') });
      }
      controller.abort(); // Stop sibling uploads after a preparation failure.
    } finally { if (guard.current === controller) guard.current = null; }
  };
  const cancel = async () => {
    const saved = data.videoRequest; if (!saved?.jobId) return;
    try { await requestCancelSpeechJob(saved.jobId); }
    catch { if (isCurrent(saved)) store().updateNodeDataSilent(nodeId, { message: 'Не удалось отменить запрос. Проверьте результат.' }); }
  };
  const isCurrent = (saved: Saved) => getActiveAssetScope()?.documentId === saved.documentId
    && getActiveAssetScope()?.workspaceId === saved.workspaceId
    && (store().nodes.find((node) => node.id === nodeId)?.data as GenerateVideoNodeData | undefined)?.videoRequest?.idempotencyKey === saved.idempotencyKey;
  const release = async () => {
    const saved = data.videoRequest; if (!saved || guard.current) return;
    if (saved.jobId) {
      const response = await readVideoJob(saved.jobId).catch(() => undefined);
      if (!isCurrent(saved)) return;
      if (!response || !['failed', 'canceled'].includes(response.job.status) || !isVideoJobTerminal(response)) {
        store().updateNodeDataSilent(nodeId, { message: 'Сначала проверьте результат текущего запроса.' }); return;
      }
    }
    const warning = saved.jobId ? '' : 'Сервер не подтвердил ID задания. Сначала проверьте результат или историю OpenRouter: запрос мог быть принят. ';
    if (!isCurrent(saved) || !window.confirm(`${warning}Новая генерация может списать средства повторно. Завершить работу с этим запросом?`)) return;
    if (!isCurrent(saved)) return;
    store().updateNodeDataSilent(nodeId, { videoRequest: undefined, message: '' }); store().setNodeStatus(nodeId, 'idle'); setProgress('');
  };
  return { start, progress, cancel, release, check: () => data.videoRequest && execute(data.videoRequest), hasScope: Boolean(scope) };
}
