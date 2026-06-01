'use client';

import { useMemo } from 'react';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from '@/entities/production-graph/model/node-layout';
import type { ProductionNode, SketchNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import {
  MODEL_EXTENDED_GEMINI_FLASH_ASPECT_RATIOS,
  MODEL_FALLBACK_ASPECT_RATIOS,
} from '@/shared/api/openrouter-models';
import { saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { valueSelectOptions } from '../lib/node-select-options';

const SKETCH_OUTPUT_LONG_SIDE = 1024;

export const sketchAspectRatioOptions = valueSelectOptions(
  Array.from(new Set([...MODEL_FALLBACK_ASPECT_RATIOS, ...MODEL_EXTENDED_GEMINI_FLASH_ASPECT_RATIOS])),
);

export const sketchPalette = [
  '#111111',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#8b5e34',
];

export function useSketchNodeModel(node: ProductionNode) {
  const data = node.data as SketchNodeData;
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const aspectRatio = data.aspectRatio || DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO;
  const brushColor = data.brushColor || sketchPalette[0];
  const brushSize = Number(data.brushSize || 18);
  const asset = assets.find((item) => item.id === data.assetId);

  const canvasSize = useMemo(() => getSketchCanvasSize(aspectRatio), [aspectRatio]);

  const saveCanvas = async (canvas: HTMLCanvasElement) => {
    const file = await canvasToPngFile(canvas, `sketch-${Date.now()}.png`);
    const nextAsset = await saveImageAsset(file);
    addAsset(nextAsset);
    updateNodeData(node.id, { assetId: nextAsset.id });
  };

  return {
    aspectRatio,
    aspectRatioOptions: sketchAspectRatioOptions,
    asset,
    brushColor,
    brushSize,
    canvasSize,
    data,
    handleAspectRatioChange: (nextAspectRatio: string) => {
      updateNodeData(node.id, { aspectRatio: nextAspectRatio, assetId: undefined });
    },
    handleBrushColorChange: (nextColor: string) => {
      updateNodeData(node.id, { brushColor: nextColor });
    },
    handleBrushSizeChange: (nextBrushSize: number) => {
      updateNodeData(node.id, { brushSize: String(nextBrushSize) });
    },
    saveCanvas,
  };
}

function getSketchCanvasSize(aspectRatio: string) {
  const [rawWidth, rawHeight] = aspectRatio.split(':').map(Number);
  const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1;

  if (ratio >= 1) {
    return {
      width: SKETCH_OUTPUT_LONG_SIDE,
      height: Math.max(128, Math.round(SKETCH_OUTPUT_LONG_SIDE / ratio)),
    };
  }

  return {
    width: Math.max(128, Math.round(SKETCH_OUTPUT_LONG_SIDE * ratio)),
    height: SKETCH_OUTPUT_LONG_SIDE,
  };
}

function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось сохранить sketch как изображение.'));
        return;
      }

      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });
}
