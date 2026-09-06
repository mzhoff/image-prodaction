'use client';

import { Upload } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ImportImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveUploadedImageAsset } from '@/entities/production-graph/lib/asset-db';
import { saveUploadedAudioAsset } from '@/entities/production-graph/lib/remote-audio-asset';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { AudioPlayer } from '../audio-player';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function ImportImageNode({ node }: { node: ProductionNode }) {
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
    const audio = file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(file.name);
    const nextKind = audio ? 'audio' : 'image';
    const state = useProductionGraphStore.getState();
    if ((data.mediaKind || 'image') !== nextKind && state.edges.some((edge) => edge.sourceNodeId === node.id)
      && !window.confirm('Changing media type removes incompatible connections. Continue?')) return;
    setUploading(true); setError('');
    const requestId = Symbol(); uploadGuard.current = requestId;
    try {
      const asset = audio ? await saveUploadedAudioAsset(file, scope) : await saveUploadedImageAsset(file);
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
      {data.mediaKind === 'audio' ? <AudioPlayer assetId={data.assetId} /> : <ImagePlate assetId={data.assetId} adaptive />}
      <input ref={fileInputRef} aria-label="Upload image or audio" type="file" accept="image/*,.heic,.heif,audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac" hidden onChange={handleUpload} />
      <PrimaryActionButton disabled={uploading} icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
        {uploading ? 'Uploading…' : 'Upload image or audio'}
      </PrimaryActionButton>
      <div className="node-note node-note-compact">Audio: up to 50 MiB / 30 minutes.</div>
      {error ? <div className="node-note" role="alert">{error}</div> : null}
    </>
  );
}
