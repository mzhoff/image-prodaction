'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { deriveRemoteVideoAsset } from '@/entities/production-graph/lib/remote-video-asset';
import { AssetClientError, getActiveAssetScope, getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { getCropVideoSignature } from '@/entities/production-graph/model/crop-video-result';
import { getFirstIncomingVideoAsset, getNodeVideoAssetId } from '@/entities/production-graph/model/graph-video-io';
import type { AssetRecord, CropImageNodeData, CropRect, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

/** Video encoding is explicit; moving the frame only updates the draft. */
export function useCropVideoProcessing(node: ProductionNode, source: AssetRecord | undefined, crop: CropRect) {
  const scope = useSyncExternalStore(subscribeActiveAssetScope, getActiveAssetScopeSnapshot, () => undefined);
  const controllerRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signature = source?.kind === 'video' ? getCropVideoSignature(source.id, crop) : undefined;
  useEffect(() => {
    setBusy(false);
    setError('');
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [node.id, signature, scope?.documentId, scope?.workspaceId]);

  const cancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
  };
  const prepare = async () => {
    const active = getActiveAssetScope();
    if (!active || !source || !signature || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const current = () => {
      if (controller.signal.aborted || controllerRef.current !== controller
        || getActiveAssetScope()?.workspaceId !== active.workspaceId
        || getActiveAssetScope()?.documentId !== active.documentId) return false;
      const store = useProductionGraphStore.getState();
      const latest = store.nodes.find((item) => item.id === node.id);
      if (latest?.type !== 'cropImage' || store.edges.some((edge) => edge.targetNodeId === node.id && edge.targetPortId === 'image')) return false;
      const incoming = getFirstIncomingVideoAsset(node.id, 'video', store);
      return incoming && getCropVideoSignature(incoming.id, (latest.data as CropImageNodeData).crop) === signature;
    };
    if (!current()) { controllerRef.current = null; return; }
    setBusy(true);
    setError('');
    try {
      const asset = await deriveRemoteVideoAsset({ workspaceId: active.workspaceId, assetId: source.id, kind: 'crop', crop }, fetch, controller.signal);
      if (!current()) return;
      if (asset.kind !== 'video') throw new Error('Сервер не вернул обрезанное видео.');
      const store = useProductionGraphStore.getState();
      store.addAsset(asset);
      store.updateNodeData(node.id, { videoResultAssetId: asset.id, videoResultSignature: signature, message: '' });
    } catch (cause) {
      if (current()) setError(cropVideoErrorMessage(cause));
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
    }
  };
  const store = useProductionGraphStore.getState();
  const resultId = getNodeVideoAssetId(node, 'videoResult', store);
  const result = store.assets.find((asset) => asset.id === resultId && asset.kind === 'video');
  return { prepare, cancel, busy, error, result, canPrepare: Boolean(scope && signature && source?.storage.type === 'remote') };
}

function cropVideoErrorMessage(cause: unknown) {
  if (cause instanceof AssetClientError) {
    if (cause.status === 409 || cause.status === 503) return 'Обработка видео ещё занята. Повторите через несколько секунд.';
    if (cause.status === 401 || cause.status === 403) return 'Нет доступа к этому видео. Проверьте вход в аккаунт и рабочее пространство.';
    if (cause.code?.includes('timeout')) return 'Обработка заняла слишком много времени. Попробуйте более короткое видео.';
    if (cause.code?.includes('limit')) return 'Видео слишком большое для обработки. Попробуйте более короткий ролик.';
  }
  return 'Не удалось обрезать видео. Исходный файл сохранён — попробуйте ещё раз.';
}
