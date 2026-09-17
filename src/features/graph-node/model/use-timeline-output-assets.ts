'use client';

import { useEffect, useState } from 'react';
import { getActiveAssetScope, type ActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { getNodeTimelineAnalysis } from '@/entities/production-graph/model/graph-timeline-io';
import type { TimelineHandoffNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { getTimelineOutputShots, timelineClipSignature } from '@/shared/media/timeline-output';
import { prepareTimelineClip, prepareTimelineFrame } from '../api/timeline-api';

function outputSignature(analysis: TimelineAnalysis, data: TimelineHandoffNodeData) {
  return JSON.stringify([analysis.sourceAssetId, analysis.sourceChecksum, data.outputScope ?? 'selected',
    getTimelineOutputShots(analysis, data.outputScope ?? 'selected', data.activeShotIndex)
      .map((shot) => [shot.id, shot.startMs, shot.endMs, shot.frames.map((frame) => frame.timeMs)])]);
}

/** Settle edits before preparing private references; stale responses cannot replace newer frames. */
export function useTimelineOutputAssets(nodeId: string, analysis: TimelineAnalysis | undefined,
  data: TimelineHandoffNodeData, scope: ActiveAssetScope | undefined, locked: boolean) {
  const [status, setStatus] = useState({ busy: false, error: '' });
  const [retry, setRetry] = useState(0);
  const signature = analysis ? outputSignature(analysis, data) : undefined;
  useEffect(() => {
    setStatus({ busy: false, error: '' });
    if (!scope || !signature || locked) return;
    const controller = new AbortController();
    const current = () => {
      if (controller.signal.aborted || getActiveAssetScope()?.workspaceId !== scope.workspaceId
        || getActiveAssetScope()?.documentId !== scope.documentId) return undefined;
      const store = useProductionGraphStore.getState();
      const node = store.nodes.find((item) => item.id === nodeId);
      const latest = getNodeTimelineAnalysis(node, store);
      const nodeData = node?.data as TimelineHandoffNodeData | undefined;
      return latest && nodeData && !nodeData.request && outputSignature(latest, nodeData) === signature
        ? { analysis: latest, data: nodeData, store } : undefined;
    };
    const run = async () => {
      const initial = current();
      if (!initial) return;
      const shots = getTimelineOutputShots(initial.analysis, initial.data.outputScope ?? 'selected', initial.data.activeShotIndex);
      const missing = shots.flatMap((shot) => shot.frames.filter((frame) => !frame.assetId)
        .map((frame) => ({ shotId: shot.id, timeMs: frame.timeMs })));
      const clip = initial.data.outputScope !== 'all' ? shots[0] : undefined;
      const clipSignature = clip ? timelineClipSignature(initial.analysis, clip) : undefined;
      const needsClip = clip && (!initial.data.videoResultAssetId || initial.data.videoResultSignature !== clipSignature);
      if (!missing.length && !needsClip) return;
      setStatus({ busy: true, error: '' });
      try {
        for (const frame of missing) {
          const asset = await prepareTimelineFrame(scope.workspaceId, initial.analysis.sourceAssetId, frame.timeMs, controller.signal);
          const latest = current();
          if (!latest) return;
          latest.store.addAsset(asset);
          latest.store.updateNodeDataSilent(nodeId, { analysis: { ...latest.analysis, shots: latest.analysis.shots.map((shot) =>
            shot.id === frame.shotId ? { ...shot, frames: shot.frames.map((item) => item.timeMs === frame.timeMs ? { ...item, assetId: asset.id } : item) } : shot) } });
        }
        if (needsClip && clip) {
          const asset = await prepareTimelineClip(scope.workspaceId, initial.analysis.sourceAssetId, clip.startMs, clip.endMs, controller.signal);
          const latest = current();
          if (!latest) return;
          latest.store.addAsset(asset);
          latest.store.updateNodeDataSilent(nodeId, { videoResultAssetId: asset.id, videoResultSignature: clipSignature });
        }
        if (current()) setStatus({ busy: false, error: '' });
      } catch (error) {
        if (current()) setStatus({ busy: false, error: error instanceof Error ? error.message : 'Не удалось подготовить выходы. Повторите попытку.' });
      }
    };
    const timer = setTimeout(() => { void run(); }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [nodeId, signature, scope, locked, retry]);
  return { ...status, retry: () => setRetry((value) => value + 1) };
}
