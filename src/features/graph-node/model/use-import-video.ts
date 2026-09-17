'use client';

import { useEffect, useRef, useState } from 'react';
import { deriveRemoteVideoAsset } from '@/entities/production-graph/lib/remote-video-asset';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { ImportImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getImportVideoPreviewAssetId } from '@/entities/production-graph/model/graph-video-io';

export function useImportVideo(node: ProductionNode) {
  const data = node.data as ImportImageNodeData;
  const source = useProductionGraphStore((state) => state.assets.find((asset) => asset.id === data.assetId));
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  const requestGuard = useRef<symbol | null>(null);
  useEffect(() => { requestGuard.current = null; setBusy(undefined); setError(''); }, [node.id, data.assetId]);
  useEffect(() => () => { requestGuard.current = null; }, []);
  const tracks = source?.video?.audioTracks ?? [];
  const selectedTrack = data.videoAudioTrackIndex ?? tracks.find((track) => track.isDefault)?.index ?? tracks[0]?.index;
  const matchingSource = data.videoDerivedSourceAssetId === data.assetId;
  const audioAssetId = matchingSource && data.videoDerivedAudioTrackIndex === selectedTrack ? data.videoAudioAssetId : undefined;
  const videoAssetId = matchingSource ? data.videoOnlyAssetId : undefined;
  const previewAssetId = getImportVideoPreviewAssetId(data, selectedTrack);

  const prepare = async (kind: 'audio' | 'video-only' | 'preview') => {
    const scope = getActiveAssetScope();
    if (!scope || !data.assetId || requestGuard.current) return;
    const requestId = Symbol(); requestGuard.current = requestId;
    setBusy(kind); setError('');
    try {
      const asset = await deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId: data.assetId, kind,
        ...(kind !== 'video-only' && selectedTrack !== undefined ? { audioTrackIndex: selectedTrack } : {}) });
      const store = useProductionGraphStore.getState();
      const current = store.nodes.find((item) => item.id === node.id)?.data as ImportImageNodeData | undefined;
      if (requestGuard.current !== requestId || current?.assetId !== data.assetId
        || getActiveAssetScope()?.workspaceId !== scope.workspaceId || getActiveAssetScope()?.documentId !== scope.documentId
        || current.videoAudioTrackIndex !== data.videoAudioTrackIndex) return;
      store.addAsset(asset);
      store.updateNodeData(node.id, { videoDerivedSourceAssetId: data.assetId,
        ...(kind === 'audio' ? { videoAudioAssetId: asset.id, videoDerivedAudioTrackIndex: selectedTrack }
          : kind === 'video-only' ? { videoOnlyAssetId: asset.id } : { videoPreviewAssetId: asset.id, videoPreviewAudioTrackIndex: selectedTrack }) });
    } catch (cause) { if (requestGuard.current === requestId) setError(cause instanceof Error ? cause.message : 'Could not prepare the track.'); }
    finally { if (requestGuard.current === requestId) { requestGuard.current = null; setBusy(undefined); } }
  };

  const selectTrack = (value: string) => {
    requestGuard.current = null; setBusy(undefined); setError('');
    useProductionGraphStore.getState().updateNodeData(node.id, { videoAudioTrackIndex: Number(value),
      videoAudioAssetId: undefined, videoDerivedAudioTrackIndex: undefined, videoPreviewAssetId: undefined, videoPreviewAudioTrackIndex: undefined });
  };
  return { source, tracks, selectedTrack, audioAssetId, videoAssetId, previewAssetId, busy, error, prepare, selectTrack };
}
