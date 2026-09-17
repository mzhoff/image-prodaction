'use client';

import { Upload } from '@prodactionpro/ui-core/icons';
import type { ChangeEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ImportImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveImportedMediaAsset } from '@/entities/production-graph/lib/import-media-asset';
import { getImportMediaKind } from '@/shared/lib/import-media-file';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { AudioPlayer } from '../audio-player';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';
import { ImportVideoBody } from './import-video-body';

export function ImportImageNode({ node, onStartConnection }: { node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const data = node.data as ImportImageNodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const uploadGuard = useRef<symbol | null>(null);
  useEffect(() => () => { uploadGuard.current = null; }, [node.id]);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const assignAssetToNode = useProductionGraphStore((state) => state.assignAssetToNode);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (uploadGuard.current) return;
    const scope = getActiveAssetScope();
    const nextKind = getImportMediaKind(file);
    if (!nextKind) { setError('Choose an image, audio, or MP4/MOV/WebM video file.'); return; }
    const state = useProductionGraphStore.getState();
    if ((data.mediaKind || 'image') !== nextKind && state.edges.some((edge) => edge.sourceNodeId === node.id)
      && !window.confirm('Changing media type removes incompatible connections. Continue?')) return;
    setUploading(true); setError('');
    const requestId = Symbol(); uploadGuard.current = requestId;
    try {
      const asset = await saveImportedMediaAsset(file, scope);
      if (uploadGuard.current !== requestId || getActiveAssetScope()?.documentId !== scope?.documentId
        || getActiveAssetScope()?.workspaceId !== scope?.workspaceId) return;
      addAsset(asset);
      assignAssetToNode(node.id, asset.id);
    } catch (cause) { if (uploadGuard.current === requestId) setError(cause instanceof Error ? cause.message : 'Could not upload the file.'); }
    finally { if (uploadGuard.current === requestId) { uploadGuard.current = null; setUploading(false); } }
  };

  return (
    <>
      <NodeTitle title={data.title} nodeType={node.type} muted />
      {data.mediaKind === 'video' ? <ImportVideoBody node={node} onStartConnection={onStartConnection} />
        : data.mediaKind === 'audio' ? <AudioPlayer assetId={data.assetId} /> : <ImagePlate assetId={data.assetId} adaptive />}
      <input ref={fileInputRef} aria-label="Upload image, audio or video" type="file" accept="image/*,.heic,.heif,audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.mp4,.mov,.webm" hidden onChange={handleUpload} />
      <PrimaryActionButton disabled={uploading} icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
        {uploading ? 'Uploading…' : 'Upload image, audio or video'}
      </PrimaryActionButton>
      {error ? <div className="node-note" role="alert">{error}</div> : null}
    </>
  );
}
