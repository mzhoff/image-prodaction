'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ProductionNode, RemoveBackgroundNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestRemoveBackground } from '@/shared/api/ai-client';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import { blobToDataUrl, dataUrlToFile } from '@/shared/lib/image-data-url';

export function useRemoveBackgroundNodeModel(node: ProductionNode) {
  const data = node.data as RemoveBackgroundNodeData;
  const [processing, setProcessing] = useState(false);
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const sourceAsset = useMemo(() => (
    getFirstIncomingImageAsset(node.id, 'image', { edges, nodes, assets })
  ), [assets, edges, node.id, nodes]);
  const resultAsset = useMemo(() => (
    assets.find((asset) => asset.id === data.resultAssetId)
  ), [assets, data.resultAssetId]);

  const handleRemoveBackground = useCallback(async () => {
    if (!sourceAsset) {
      updateNodeData(node.id, { message: 'Подключи image output к входу Remove BG.' });
      return;
    }

    setProcessing(true);
    setNodeStatus(node.id, 'running');
    updateNodeData(node.id, { message: '' });
    try {
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать изображение из локального хранилища.');

      const result = await requestRemoveBackground({
        imageDataUrl: await blobToDataUrl(sourceBlob),
      });
      const file = await dataUrlToFile(result.imageDataUrl, `removed-bg-${Date.now()}.png`);
      const asset = await saveImageAsset(file);
      addAsset(asset);
      updateNodeData(node.id, {
        resultAssetId: asset.id,
        message: result.message ?? 'Background removed.',
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить фон через FAL.';
      updateNodeData(node.id, { message });
      setNodeStatus(node.id, 'error');
    } finally {
      setProcessing(false);
    }
  }, [addAsset, node.id, setNodeStatus, sourceAsset, updateNodeData]);

  return {
    data,
    displayAsset: resultAsset ?? sourceAsset,
    handleRemoveBackground,
    hasResult: Boolean(resultAsset),
    processing,
    sourceAsset,
  };
}
