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
import { loadAssetBlob } from '@/shared/lib/asset-db';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { exportImageBlob, getExportFileName } from '../lib/export-image';
import { findIncomingImageAsset } from '../lib/generate-node-inputs';

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
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const sourceAsset = useMemo(() => (
    findIncomingImageAsset(node.id, 'image', edges, nodes, assets)
  ), [assets, edges, node.id, nodes]);

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
    if (!sourceAsset) {
      setMessage('Подключи image output к входу Export.');
      return;
    }

    setExporting(true);
    setMessage('');
    try {
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать изображение из локального хранилища.');
      const exported = await exportImageBlob(sourceBlob, {
        background: data.background,
        format: data.format,
        quality: data.quality,
        scale: data.scale,
      });
      downloadBlob(exported.blob, getExportFileName(sourceAsset.name, exported.extension));
      setMessage(`${exported.width}x${exported.height} · ${exported.mimeType}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось экспортировать изображение.');
    } finally {
      setExporting(false);
    }
  }, [data.background, data.format, data.quality, data.scale, sourceAsset]);

  return {
    backgroundOptions: data.format === 'jpeg' ? opaqueBackgroundOptions : exportBackgroundOptions,
    data,
    exporting,
    handleBackgroundChange,
    handleDownload,
    handleFormatChange,
    handleQualityChange,
    handleScaleChange,
    message,
    sourceAsset,
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
