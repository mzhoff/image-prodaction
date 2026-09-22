'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssetRecord,
  ExportImageNodeData,
} from '@/entities/production-graph/model/types';
import {
  deleteAssetBlob,
  loadAssetBlob,
  saveTransientImageAsset,
} from '@/entities/production-graph/lib/asset-db';
import { createExportImageResultSignature } from '@/entities/production-graph/model/export-image-result';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { exportImageBlob, getExportFileName } from '../lib/export-image';

export function useExportImageOutput(
  nodeId: string,
  data: ExportImageNodeData,
  sourceAsset: AssetRecord | undefined,
) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [messageState, setMessageState] = useState<{ signature?: string; text: string }>({ text: '' });
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const processingRef = useRef(0);
  const options = useMemo(() => ({
    background: data.background,
    format: data.format,
    quality: data.quality,
    scale: data.scale,
  }), [data.background, data.format, data.quality, data.scale]);
  const signature = sourceAsset ? createExportImageResultSignature(sourceAsset.id, options) : undefined;
  const resultAsset = useMemo(() => (
    data.resultSignature === signature && data.sourceAssetId === sourceAsset?.id
      ? assets.find((asset) => asset.id === data.resultAssetId)
      : undefined
  ), [assets, data.resultAssetId, data.resultSignature, data.sourceAssetId, signature, sourceAsset?.id]);

  useEffect(() => {
    if (sourceAsset && signature && resultAsset) return undefined;
    const runId = processingRef.current + 1;
    processingRef.current = runId;

    if (!sourceAsset || !signature) {
      if (data.resultAssetId || data.resultSignature || data.sourceAssetId) {
        updateNodeDataSilent(nodeId, clearExportResult());
      }
      return undefined;
    }
    if (data.resultAssetId || data.resultSignature || data.sourceAssetId) {
      updateNodeDataSilent(nodeId, clearExportResult());
      return undefined;
    }

    let cancelled = false;
    let settled = false;
    const timer = window.setTimeout(async () => {
      try {
        setMessageState({ signature, text: '' });
        setNodeStatus(nodeId, 'running');
        const sourceBlob = await loadAssetBlob(sourceAsset);
        if (!sourceBlob) throw new Error(tEffect("Не удалось прочитать изображение из локального хранилища."));
        const exported = await exportImageBlob(sourceBlob, options);
        if (cancelled || processingRef.current !== runId) return;
        const asset = await saveTransientImageAsset(new File(
          [exported.blob],
          getExportFileName(sourceAsset.name, exported.extension),
          { type: exported.mimeType },
        ));
        if (cancelled || processingRef.current !== runId) {
          await deleteAssetBlob(asset).catch(() => undefined);
          return;
        }
        addAsset(asset);
        updateNodeDataSilent(nodeId, {
          resultAssetId: asset.id,
          resultSignature: signature,
          sourceAssetId: sourceAsset.id,
        });
        setMessageState({
          signature,
          text: `${exported.width}x${exported.height} · ${exported.mimeType}`,
        });
        settled = true;
        setNodeStatus(nodeId, 'success');
      } catch (error) {
        if (cancelled || processingRef.current !== runId) return;
        setMessageState({
          signature,
          text: error instanceof Error ? error.message : tEffect("Не удалось подготовить изображение."),
        });
        settled = true;
        setNodeStatus(nodeId, 'error');
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!settled && processingRef.current === runId) setNodeStatus(nodeId, 'idle');
    };
  }, [addAsset, data.resultAssetId, data.resultSignature, data.sourceAssetId, nodeId, options, resultAsset, setNodeStatus, signature, sourceAsset, updateNodeDataSilent]);

  return {
    message: messageState.signature === signature ? messageState.text : '',
    resultAsset,
  };
}

function clearExportResult(): Partial<ExportImageNodeData> {
  return { resultAssetId: undefined, resultSignature: undefined, sourceAssetId: undefined };
}
