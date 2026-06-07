'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  ExportImageBackground,
  ExportImageFormat,
  ExportImageNodeData,
  ExportImageScale,
  ProductionNode,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { getIncomingImageCollectionInputs } from '@/entities/production-graph/model/graph-io';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { createZipBlob } from '@/shared/lib/zip-file';
import { exportImageBlob, getExportFileName } from '../lib/export-image';

export const exportFormatOptions: DarkSelectOption[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
];

export const exportQualityOptions: DarkSelectOption[] = [
  { value: '100', label: '100%' },
  { value: '90', label: '90%' },
  { value: '80', label: '80%' },
  { value: '70', label: '70%' },
  { value: '60', label: '60%' },
];

export const exportScaleOptions: DarkSelectOption[] = [
  { value: '1', label: '100%' },
  { value: '0.75', label: '75%' },
  { value: '0.5', label: '50%' },
  { value: '0.25', label: '25%' },
];

export const exportBackgroundOptions: DarkSelectOption[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

const opaqueBackgroundOptions = exportBackgroundOptions.filter((option) => option.value !== 'transparent');

export function useExportImageNodeModel(node: ProductionNode) {
  const data = node.data as ExportImageNodeData;
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const sourceItems = useMemo(() => (
    getIncomingImageCollectionInputs(node.id, 'image', { edges, nodes, assets })
      .sort((first, second) => {
        const firstY = first.sourceNode.position.y;
        const secondY = second.sourceNode.position.y;
        if (firstY !== secondY) return firstY - secondY;
        if (first.sourceNode.position.x !== second.sourceNode.position.x) {
          return first.sourceNode.position.x - second.sourceNode.position.x;
        }
        return (first.collectionIndex ?? 0) - (second.collectionIndex ?? 0);
      })
  ), [assets, edges, node.id, nodes]);
  const safeActiveIndex = getSafeIndex(activeIndex, sourceItems.length);
  const activeSourceItem = sourceItems[safeActiveIndex];
  const sourceAsset = activeSourceItem?.asset;
  const sourceAssetIds = useMemo(() => sourceItems.map((item) => item.assetId), [sourceItems]);

  const handleFormatChange = useCallback((format: string) => {
    const nextFormat = format as ExportImageFormat;
    updateNodeData(node.id, {
      format: nextFormat,
      ...(nextFormat === 'jpeg' && data.background === 'transparent' ? { background: 'white' as const } : {}),
    });
  }, [data.background, node.id, updateNodeData]);

  const handleQualityChange = useCallback((quality: string) => {
    updateNodeData(node.id, { quality });
  }, [node.id, updateNodeData]);

  const handleScaleChange = useCallback((scale: string) => {
    updateNodeData(node.id, { scale: scale as ExportImageScale });
  }, [node.id, updateNodeData]);

  const handleBackgroundChange = useCallback((background: string) => {
    updateNodeData(node.id, { background: background as ExportImageBackground });
  }, [node.id, updateNodeData]);

  const handleDownload = useCallback(async () => {
    if (sourceItems.length === 0) {
      setMessage('Подключи image output к входу Export.');
      return;
    }

    setExporting(true);
    setMessage('');
    try {
      const exportOptions = {
        background: data.background,
        format: data.format,
        quality: data.quality,
        scale: data.scale,
      };

      if (sourceItems.length === 1) {
        const sourceBlob = await loadAssetBlob(sourceItems[0].asset);
        if (!sourceBlob) throw new Error('Не удалось прочитать изображение из локального хранилища.');
        const exported = await exportImageBlob(sourceBlob, exportOptions);
        downloadBlob(exported.blob, getExportFileName(sourceItems[0].asset.name, exported.extension));
        setMessage(`${exported.width}x${exported.height} · ${exported.mimeType}`);
        return;
      }

      const zipEntries = [];
      for (let index = 0; index < sourceItems.length; index += 1) {
        const item = sourceItems[index];
        const sourceBlob = await loadAssetBlob(item.asset);
        if (!sourceBlob) throw new Error(`Не удалось прочитать ${item.asset.name} из локального хранилища.`);
        const exported = await exportImageBlob(sourceBlob, exportOptions);
        zipEntries.push({
          blob: exported.blob,
          path: getBatchExportFileName(item.asset.name, exported.extension, index, sourceItems.length),
        });
      }

      const zipBlob = await createZipBlob(zipEntries);
      downloadBlob(zipBlob, createDatedZipFileName('reverie-export'));
      setMessage(`ZIP · ${zipEntries.length} files · ${data.format.toUpperCase()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось экспортировать изображение.');
    } finally {
      setExporting(false);
    }
  }, [data.background, data.format, data.quality, data.scale, sourceItems]);

  return {
    activeIndex: safeActiveIndex,
    activeSourceItem,
    backgroundOptions: data.format === 'jpeg' ? opaqueBackgroundOptions : exportBackgroundOptions,
    data,
    downloadLabel: sourceItems.length > 1 ? 'Download ZIP' : 'Download',
    exporting,
    handleBackgroundChange,
    handleDownload,
    handleFormatChange,
    handleQualityChange,
    handleScaleChange,
    message,
    sourceAsset,
    sourceAssetIds,
    sourceCount: sourceItems.length,
    setActiveIndex,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getSafeIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return Math.min(Math.max(index, 0), length - 1);
}

function getBatchExportFileName(sourceName: string | undefined, extension: string, index: number, total: number) {
  const baseName = getExportFileName(sourceName, extension);
  const prefix = String(index + 1).padStart(String(total).length, '0');
  return `${prefix}-${baseName}`;
}

function createDatedZipFileName(prefix: string, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `${prefix}-${stamp}.zip`;
}
