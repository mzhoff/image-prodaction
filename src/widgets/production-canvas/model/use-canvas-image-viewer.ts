import { useCallback, useMemo, useState } from 'react';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import {
  isAssetInLibrary,
  persistAssetToLibrary,
} from '@/entities/production-graph/lib/persist-asset-to-library';
import { getNodeImageAssetIds } from '@/entities/production-graph/model/graph-io';
import type { AssetRecord, GenerationResultMetadata, ProductionNode } from '@/entities/production-graph/model/types';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';

interface UseCanvasImageViewerOptions {
  assets: AssetRecord[];
  nodesById: Map<string, ProductionNode>;
  showToast: (message: string) => void;
}

export function useCanvasImageViewer({ assets, nodesById, showToast }: UseCanvasImageViewerOptions) {
  const [contextImageViewer, setContextImageViewer] = useState<{ nodeId: string; index: number } | null>(null);
  const imageViewerNode = contextImageViewer ? nodesById.get(contextImageViewer.nodeId) : undefined;
  const imageViewerAssetIds = useMemo(() => getNodeImageAssetIds(imageViewerNode), [imageViewerNode]);
  const imageViewerCurrentIndex = getSafeImageIndex(contextImageViewer?.index, imageViewerAssetIds.length);
  const imageViewerAssetId = imageViewerCurrentIndex >= 0 ? imageViewerAssetIds[imageViewerCurrentIndex] : undefined;
  const imageViewerAsset = imageViewerAssetId ? assets.find((asset) => asset.id === imageViewerAssetId) : undefined;
  const imageViewerUrl = useAssetUrl(imageViewerAssetId);

  const closeImageViewer = useCallback(() => setContextImageViewer(null), []);
  const openImageViewer = useCallback((nodeId: string, index: number) => {
    setContextImageViewer({ nodeId, index });
  }, []);
  const selectImageViewerVersion = useCallback((index: number) => {
    setContextImageViewer((viewer) => (viewer ? { ...viewer, index: getSafeImageIndex(index, imageViewerAssetIds.length) } : viewer));
  }, [imageViewerAssetIds.length]);
  const showPreviousImageViewerVersion = useCallback(() => {
    setContextImageViewer((viewer) => (viewer ? { ...viewer, index: wrapImageIndex(viewer.index - 1, imageViewerAssetIds.length) } : viewer));
  }, [imageViewerAssetIds.length]);
  const showNextImageViewerVersion = useCallback(() => {
    setContextImageViewer((viewer) => (viewer ? { ...viewer, index: wrapImageIndex(viewer.index + 1, imageViewerAssetIds.length) } : viewer));
  }, [imageViewerAssetIds.length]);
  const saveImageViewerAssetToLibrary = useCallback(async () => {
    if (!imageViewerAsset) throw new Error('Активное изображение не найдено.');
    await persistAssetToLibrary(imageViewerAsset);
    showToast('Image saved to Library.');
  }, [imageViewerAsset, showToast]);

  const downloadAssets = useCallback(async (assetIds: string[]) => {
    const selectedAssets = uniqueStrings(assetIds)
      .map((assetId) => assets.find((asset) => asset.id === assetId))
      .filter((asset): asset is AssetRecord => Boolean(asset));

    if (selectedAssets.length === 0) {
      showToast('No image files to download.');
      return;
    }

    try {
      for (const asset of selectedAssets) {
        const blob = await loadAssetBlob(asset);
        if (!blob) continue;
        downloadBlob(blob, asset.name || `${asset.id}.png`);
      }
      showToast(selectedAssets.length === 1 ? 'Image download started.' : `${selectedAssets.length} image downloads started.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not download image files.');
    }
  }, [assets, showToast]);

  return {
    downloadAssets,
    imageViewer: imageViewerNode && imageViewerAsset && imageViewerAssetId && imageViewerUrl ? {
      asset: imageViewerAsset,
      assetId: imageViewerAssetId,
      assetMetadata: getNodeAssetMetadata(imageViewerNode),
      currentIndex: imageViewerCurrentIndex,
      hasHistory: imageViewerAssetIds.length > 1,
      historyAssetIds: imageViewerAssetIds,
      onClose: closeImageViewer,
      onNext: showNextImageViewerVersion,
      onPrevious: showPreviousImageViewerVersion,
      onSaveToLibrary: saveImageViewerAssetToLibrary,
      onSelectVersion: selectImageViewerVersion,
      savedToLibrary: isAssetInLibrary(imageViewerAsset),
      sourceModel: getNodeSourceModel(imageViewerNode),
      url: imageViewerUrl,
    } : null,
    openImageViewer,
  };
}

function getNodeAssetMetadata(node: ProductionNode): Record<string, GenerationResultMetadata> | undefined {
  const data = node.data as unknown as Record<string, unknown>;
  return data.resultMetadata && typeof data.resultMetadata === 'object'
    ? data.resultMetadata as Record<string, GenerationResultMetadata>
    : undefined;
}

function getNodeSourceModel(node: ProductionNode) {
  const data = node.data as unknown as Record<string, unknown>;
  return typeof data.model === 'string' ? data.model : undefined;
}

function getSafeImageIndex(index: number | undefined, length: number) {
  if (length <= 0) return -1;
  if (typeof index !== 'number' || Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function wrapImageIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return (index + length) % length;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
