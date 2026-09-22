'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveAssetScope, getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { getIncomingSources } from '@/entities/production-graph/model/graph-io-sources';
import { getFirstIncomingVideoAsset, getNodeVideoAssetId } from '@/entities/production-graph/model/graph-video-io';
import type { ProductionNode, TimelineHandoffNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { estimateRemainingTime } from '@/shared/ui/process-indicator-values';
import { cancelTimelineJob, readTimelineJob, startTimelineJob, waitForTimelineJob, type TimelinePayload, type TimelineAnalysisProgress } from '../api/timeline-api';
import { useTimelineOutputAssets } from './use-timeline-output-assets';
import { applyTimelineDescriptions, limitTimelineDescription, recoverTimelineResult, timelineDescriptionBaselines, timelineUndescribedShots, wrapTimelineShotIndex } from './timeline-node-values';

type SavedRequest = NonNullable<TimelineHandoffNodeData['request']>;
function currentData(nodeId: string) {
  return useProductionGraphStore.getState().nodes.find((item) => item.id === nodeId)?.data as TimelineHandoffNodeData | undefined;
}
function currentSource(nodeId: string) {
  return getFirstIncomingVideoAsset(nodeId, 'video', useProductionGraphStore.getState());
}
function connectedVideoId(nodeId: string, context = useProductionGraphStore.getState()) {
  const source = getIncomingSources(nodeId, 'video', context)[0];
  return source ? getNodeVideoAssetId(source.sourceNode, source.sourcePortId, context) : undefined;
}

export function useTimelineNodeModel(node: ProductionNode) {
  const tUi = useTranslations();
  const data = node.data as TimelineHandoffNodeData;
  const nodes = useProductionGraphStore((state) => state.nodes);
  const edges = useProductionGraphStore((state) => state.edges);
  const assets = useProductionGraphStore((state) => state.assets);
  const activeScope = useSyncExternalStore(subscribeActiveAssetScope, getActiveAssetScopeSnapshot, () => undefined);
  const source = getFirstIncomingVideoAsset(node.id, 'video', { nodes, edges, assets });
  const guard = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState<TimelineAnalysisProgress | null>(null);
  const [descriptionProgress, setDescriptionProgress] = useState<{ completed: number; total: number; estimatedRemainingMs?: number } | null>(null);
  // Asset metadata can hydrate after the graph. It must not invalidate a saved timeline or paid job.
  const sourceId = connectedVideoId(node.id);
  const analysis = data.analysis?.sourceAssetId === sourceId ? data.analysis : undefined;
  const activeShotIndex = wrapTimelineShotIndex(data.activeShotIndex, analysis?.shots.length ?? 0);
  const outputs = useTimelineOutputAssets(node.id, analysis, data, activeScope, Boolean(data.request));
  const update = useProductionGraphStore((state) => state.updateNodeData);
  const silent = useProductionGraphStore((state) => state.updateNodeDataSilent);

  useEffect(() => () => { guard.current?.abort(); guard.current = null; }, [node.id, sourceId, activeScope?.documentId, activeScope?.workspaceId]);
  useEffect(() => {
    if (data.analysis && data.analysis.sourceAssetId !== sourceId || data.request && data.request.sourceAssetId !== sourceId) {
      if (data.request?.jobId && activeScope?.workspaceId === data.request.workspaceId && activeScope.documentId === data.request.documentId) {
        void cancelTimelineJob(data.request.jobId).catch(() => undefined);
      }
      silent(node.id, { analysis: undefined, request: undefined, activeShotIndex: 0,
        message: 'Video source changed. Analyze the connected video to prepare a new timeline.' });
      useProductionGraphStore.getState().setNodeStatus(node.id, 'idle');
    }
  }, [activeScope, data.analysis, data.request, node.id, silent, sourceId]);

  const execute = useCallback(async (saved: SavedRequest, payload?: TimelinePayload) => {
    const scope = getActiveAssetScope();
    if (!scope || guard.current || saved.workspaceId !== scope.workspaceId || saved.documentId !== scope.documentId) return;
    const controller = new AbortController(); guard.current = controller;
    const current = () => guard.current === controller && !controller.signal.aborted
      && getActiveAssetScope()?.workspaceId === scope.workspaceId && getActiveAssetScope()?.documentId === scope.documentId
      && currentData(node.id)?.request?.idempotencyKey === saved.idempotencyKey && connectedVideoId(node.id) === saved.sourceAssetId;
    const store = useProductionGraphStore.getState();
    setAnalysisProgress(null);
    setDescriptionProgress(null);
    store.setNodeStatus(node.id, 'running'); store.updateNodeDataSilent(node.id, { request: saved, message: '' });
    try {
      // Keep the submit response available even if the input is disconnected meanwhile:
      // the server may already have accepted a durable job that now needs cancellation.
      const initial = saved.jobId ? await readTimelineJob(saved.jobId, controller.signal)
        : await startTimelineJob(payload!, scope, saved.idempotencyKey);
      if (!current()) {
        const active = getActiveAssetScope();
        if (active?.workspaceId === scope.workspaceId && active.documentId === scope.documentId
          && connectedVideoId(node.id) !== saved.sourceAssetId) {
          await cancelTimelineJob(initial.job.id).catch(() => undefined);
        }
        return;
      }
      saved = { ...saved, jobId: initial.job.id };
      useProductionGraphStore.getState().updateNodeDataSilent(node.id, { request: saved });
      const result = await waitForTimelineJob(initial, { signal: controller.signal, workspaceId: scope.workspaceId,
        onUpdate: (response) => {
          if (!current()) return;
          setAnalysisProgress(response.progress?.analysis ?? null);
          const completed = response.result && !('version' in response.result) ? response.result.shots.length : 0;
          const total = saved.shotBaselines?.length ?? 0;
          const elapsed = response.job.startedAt ? Date.now() - Date.parse(response.job.startedAt) : undefined;
          setDescriptionProgress(saved.action === 'describe' ? { completed, total, estimatedRemainingMs: estimateRemainingTime(elapsed, completed, total) } : null);
          setProgress(saved.action === 'analyze' ? tUi("Ищем смены сцен и подготавливаем кадры")
            : tUi("Описания: {p1} / {p2}", { p1: completed, p2: saved.shotBaselines?.length ?? 0 }));
          const latest = currentData(node.id)?.analysis;
          if (latest && response.result && !('version' in response.result)) {
            const next = applyTimelineDescriptions(latest, response.result, saved.shotBaselines ?? []);
            if (next !== latest) useProductionGraphStore.getState().updateNodeData(node.id, { analysis: next });
          }
        } });
      if (!current()) return;
      const latest = useProductionGraphStore.getState();
      if ('version' in result && result.sourceAssetId === saved.sourceAssetId) latest.updateNodeData(node.id, { analysis: result, activeShotIndex: 0 });
      latest.updateNodeDataSilent(node.id, { request: undefined, message: '' });
      latest.setNodeStatus(node.id, 'success'); setProgress('');
    } catch (error) {
      if (!current()) return;
      useProductionGraphStore.getState().setNodeStatus(node.id, 'error');
      useProductionGraphStore.getState().updateNodeDataSilent(node.id, { message: error instanceof Error ? error.message : 'Timeline processing failed.' });
    } finally { if (guard.current === controller) guard.current = null; }
  }, [tUi, node.id]);

  useEffect(() => {
    if (activeScope && data.request?.jobId && sourceId === data.request.sourceAssetId && !guard.current) void execute(data.request);
  }, [activeScope, data.request, execute, sourceId]);

  const start = async (action: 'analyze' | 'describe', shotId?: string, remainingOnly = false) => {
    const latest = currentData(node.id);
    const scope = getActiveAssetScope();
    const video = currentSource(node.id);
    if (!latest || guard.current || !scope || !video || video.storage.type !== 'remote') return;
    if (latest.request) {
      silent(node.id, { message: 'Check or finish the previous request before starting another.' }); return;
    }
    const timeline = latest.analysis?.sourceAssetId === video.id ? latest.analysis : undefined;
    const selected = timeline?.shots.filter((shot) => !shotId || shot.id === shotId) ?? [];
    const shots = remainingOnly ? timelineUndescribedShots(selected) : selected;
    if (action === 'describe' && !shots.length) return;
    if (action === 'analyze' && timeline && !window.confirm('Analyze again? This replaces the current cuts, selected frames and descriptions.')) return;
    if (action === 'describe' && !window.confirm(`Generate ${shots.length} short description${shots.length === 1 ? '' : 's'} using the selected model? This uses provider credits.${shots.some((shot) => shot.description) ? ' Existing text for these shots will be replaced.' : ''}`)) return;
    const payload: TimelinePayload = action === 'analyze' ? { action, assetId: video.id, threshold: latest.threshold }
      : { action, assetId: video.id, sourceChecksum: timeline!.sourceChecksum, shots, model: latest.model,
        language: latest.language || navigator.language || 'en' };
    const saved: SavedRequest = { action, idempotencyKey: crypto.randomUUID(), fingerprint: JSON.stringify(payload),
      sourceAssetId: video.id, workspaceId: scope.workspaceId, documentId: scope.documentId,
      shotBaselines: action === 'describe' ? timelineDescriptionBaselines(shots) : undefined };
    await execute(saved, payload);
  };

  const edit = (change: (timeline: TimelineAnalysis) => TimelineAnalysis) => {
    const latest = currentData(node.id);
    if (guard.current || latest?.request || !latest?.analysis || latest.analysis.sourceAssetId !== connectedVideoId(node.id)) return;
    try {
      const activeId = latest.analysis.shots[wrapTimelineShotIndex(latest.activeShotIndex, latest.analysis.shots.length)]?.id;
      const next = change(latest.analysis);
      update(node.id, { analysis: next, activeShotIndex: Math.max(0, next.shots.findIndex((shot) => shot.id === activeId)), message: '' });
    }
    catch (error) { silent(node.id, { message: error instanceof Error ? error.message : 'This boundary cannot be moved.' }); }
  };
  const captureRequest = () => {
    const saved = currentData(node.id)?.request;
    const scope = getActiveAssetScope();
    const matchingScope = saved && scope && saved.workspaceId === scope.workspaceId && saved.documentId === scope.documentId;
    const current = () => matchingScope && saved && scope && getActiveAssetScope()?.workspaceId === scope.workspaceId
      && getActiveAssetScope()?.documentId === scope.documentId && currentData(node.id)?.request?.idempotencyKey === saved.idempotencyKey
      && connectedVideoId(node.id) === saved.sourceAssetId;
    return { saved: matchingScope ? saved : undefined, current };
  };
  const cancel = async () => {
    const { saved, current } = captureRequest();
    if (!saved?.jobId) return;
    try {
      await cancelTimelineJob(saved.jobId);
      if (current()) silent(node.id, { message: 'Cancellation requested. Completed descriptions stay available.' });
    } catch (error) { if (current()) silent(node.id, { message: error instanceof Error ? error.message : 'Cancellation failed.' }); }
  };
  const release = async () => {
    const { saved, current } = captureRequest();
    if (!saved || guard.current) return;
    try {
      if (!saved.jobId) throw new Error('The request may have reached the server. Retry the same action to recover its job before starting a new one.');
      const response = await readTimelineJob(saved.jobId);
      if (!current()) return;
      if (!['succeeded', 'canceled'].includes(response.job.status) && !(response.job.status === 'failed' && !response.job.error?.retryable)) throw new Error('The previous request is still active. Check its status or cancel it first.');
      const analysis = currentData(node.id)?.analysis;
      const recovered = recoverTimelineResult(analysis, response.result, saved.sourceAssetId, saved.shotBaselines ?? []);
      if (recovered !== analysis) update(node.id, { analysis: recovered, ...(response.result && 'version' in response.result ? { activeShotIndex: 0 } : {}) });
      silent(node.id, { request: undefined, message: '' });
      useProductionGraphStore.getState().setNodeStatus(node.id, 'idle'); setProgress('');
    } catch (error) { if (current()) silent(node.id, { message: error instanceof Error ? error.message : 'Cannot release this request.' }); }
  };
  const check = () => {
    const saved = currentData(node.id)?.request;
    if (!saved) return;
    // The same payload and idempotency key recover an accepted request even if its response was lost.
    try {
      const payload = saved.jobId ? undefined : JSON.parse(saved.fingerprint) as TimelinePayload;
      if (payload && (payload.assetId !== saved.sourceAssetId || payload.action !== saved.action)) throw new Error('Saved timeline request does not match this source.');
      return execute(saved, payload);
    } catch { silent(node.id, { message: 'The saved request could not be restored. Do not start a duplicate paid request; check the generation history.' }); }
  };
  return { nodeId: node.id, data, source, analysis, activeShotIndex, shot: analysis?.shots[activeShotIndex], progress, analysisProgress, descriptionProgress, outputs,
    workspaceId: activeScope?.workspaceId, busy: node.status === 'running', locked: Boolean(data.request), start, cancel, release, check, edit,
    select: (index: number) => update(node.id, { activeShotIndex: wrapTimelineShotIndex(index, analysis?.shots.length ?? 0) }),
    settings: (patch: Partial<TimelineHandoffNodeData>) => { if (!currentData(node.id)?.request) update(node.id, patch); },
    describeText: (id: string, description: string) => edit((timeline) => ({ ...timeline, shots: timeline.shots.map((shot) => shot.id === id ? { ...shot, description: limitTimelineDescription(description) } : shot) })),
  };
}

export type TimelineNodeModel = ReturnType<typeof useTimelineNodeModel>;
