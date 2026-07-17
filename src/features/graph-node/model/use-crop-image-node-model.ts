'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CropImageNodeData, CropRect, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import {
  aspectRatioValue,
  cropFromPixelSize,
  cropPixelSize,
  fitCropToAspect,
  fitCropToOutputAspectPreservingOrigin,
  fullCrop,
} from '../lib/crop-geometry';
import { cropImageBlob } from '../lib/crop-image';

export const cropAspectRatioSelectOptions: DarkSelectOption[] = [
  { value: 'Custom', label: 'Custom' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
];

const CROP_STATE_VERSION = 3;

export function useCropImageNodeModel(node: ProductionNode) {
  const data = node.data as CropImageNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const pushHistory = useProductionGraphStore((state) => state.pushHistory);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const crop = useMemo(() => data.crop ?? fullCrop(), [data.crop]);
  const sourceAsset = useMemo(() => (
    getFirstIncomingImageAsset(node.id, 'image', { edges, nodes, assets })
  ), [assets, edges, node.id, nodes]);
  const resultAsset = useMemo(() => (
    assets.find((asset) => asset.id === data.resultAssetId)
  ), [assets, data.resultAssetId]);
  const pixelSize = useMemo(() => (
    sourceAsset ? cropPixelSize(crop, sourceAsset.width, sourceAsset.height) : { height: 0, width: 0 }
  ), [crop, sourceAsset]);
  const processingRef = useRef(0);

  useEffect(() => {
    if (sourceAsset || (!data.resultAssetId && !data.message)) return;
    updateNodeDataSilent(node.id, { resultAssetId: undefined, message: '' });
  }, [data.message, data.resultAssetId, node.id, sourceAsset, updateNodeDataSilent]);

  useEffect(() => {
    if (!sourceAsset) {
      if (!data.sourceAssetId && data.sourceAspectRatio === undefined && !data.resultAssetId && !data.message) return;
      updateNodeDataSilent(node.id, {
        message: '',
        resultAssetId: undefined,
        sourceAssetId: undefined,
        sourceAspectRatio: undefined,
      });
      return;
    }

    const nextAspectRatio = sourceAsset.width && sourceAsset.height ? sourceAsset.width / sourceAsset.height : undefined;
    const sourceChanged = (
      data.sourceAssetId !== sourceAsset.id
      || data.sourceAspectRatio !== nextAspectRatio
    );
    const needsVersionUpdate = data.cropStateVersion !== CROP_STATE_VERSION;
    const firstSourceBinding = (
      !data.sourceAssetId
      && data.sourceAspectRatio === undefined
      && !data.crop
      && !data.cropStateVersion
    );

    if (!sourceChanged && !needsVersionUpdate) return;

    if (firstSourceBinding) {
      const matchedAspectRatio = sourceAsset.width && sourceAsset.height
        ? getSourceAspectRatioLabel(sourceAsset.width, sourceAsset.height)
        : 'Custom';

      updateNodeDataSilent(node.id, {
        aspectRatio: matchedAspectRatio,
        crop: fullCrop(),
        cropStateVersion: CROP_STATE_VERSION,
        locked: matchedAspectRatio !== 'Custom',
        message: '',
        resultAssetId: undefined,
        sourceAssetId: sourceAsset.id,
        sourceAspectRatio: nextAspectRatio,
      });
      return;
    }

    updateNodeDataSilent(node.id, {
      crop: sourceChanged
        ? getCropForSourceChange({
          crop,
          nextSourceAspectRatio: nextAspectRatio,
          previousSourceAspectRatio: data.sourceAspectRatio,
          selectedAspectRatio: data.aspectRatio,
        })
        : crop,
      cropStateVersion: CROP_STATE_VERSION,
      message: '',
      resultAssetId: sourceChanged ? undefined : data.resultAssetId,
      sourceAssetId: sourceAsset.id,
      sourceAspectRatio: nextAspectRatio,
    });
  }, [
    crop,
    data.aspectRatio,
    data.crop,
    data.message,
    data.resultAssetId,
    data.sourceAspectRatio,
    data.sourceAssetId,
    data.cropStateVersion,
    node.id,
    sourceAsset,
    updateNodeDataSilent,
  ]);

  useEffect(() => {
    if (!sourceAsset) {
      return undefined;
    }

    const runId = processingRef.current + 1;
    processingRef.current = runId;
    const timer = window.setTimeout(async () => {
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob || processingRef.current !== runId) return;

      try {
        const file = await cropImageBlob(sourceBlob, crop, `crop-${Date.now()}.png`);
        if (processingRef.current !== runId) return;
        const asset = await saveTransientImageAsset(file);
        addAsset(asset);
        updateNodeDataSilent(node.id, {
          resultAssetId: asset.id,
          message: `${asset.width ?? pixelSize.width}x${asset.height ?? pixelSize.height} · PNG`,
        });
      } catch (error) {
        if (processingRef.current !== runId) return;
        updateNodeDataSilent(node.id, {
          message: error instanceof Error ? error.message : 'Не удалось выполнить crop.',
        });
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    addAsset,
    crop,
    node.id,
    pixelSize.height,
    pixelSize.width,
    sourceAsset,
    updateNodeDataSilent,
  ]);

  const handleCropDragStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handleCropChange = useCallback((nextCrop: CropRect) => {
    updateNodeDataSilent(node.id, { crop: nextCrop, cropStateVersion: CROP_STATE_VERSION, message: '' });
  }, [node.id, updateNodeDataSilent]);

  const handleAspectRatioChange = useCallback((aspectRatio: string) => {
    if (aspectRatio === 'Custom') {
      updateNodeData(node.id, { aspectRatio: 'Custom', cropStateVersion: CROP_STATE_VERSION, locked: false });
      return;
    }

    const ratio = aspectRatioValue(aspectRatio);
    const nextCrop = ratio && sourceAsset?.width && sourceAsset.height
      ? fitCropToAspect(sourceAsset.width, sourceAsset.height, ratio)
      : crop;
    updateNodeData(node.id, { aspectRatio, crop: nextCrop, cropStateVersion: CROP_STATE_VERSION, locked: true, message: '' });
  }, [crop, node.id, sourceAsset?.height, sourceAsset?.width, updateNodeData]);

  const handleLockToggle = useCallback(() => {
    updateNodeData(node.id, {
      aspectRatio: data.locked ? 'Custom' : data.aspectRatio || 'Custom',
      cropStateVersion: CROP_STATE_VERSION,
      locked: !data.locked,
    });
  }, [data.aspectRatio, data.locked, node.id, updateNodeData]);

  const handleReset = useCallback(() => {
    const matchedAspectRatio = sourceAsset?.width && sourceAsset.height
      ? getSourceAspectRatioLabel(sourceAsset.width, sourceAsset.height)
      : 'Custom';
    const sourceAspectRatio = sourceAsset?.width && sourceAsset.height
      ? sourceAsset.width / sourceAsset.height
      : undefined;

    updateNodeData(node.id, {
      aspectRatio: matchedAspectRatio,
      crop: fullCrop(),
      cropStateVersion: CROP_STATE_VERSION,
      locked: matchedAspectRatio !== 'Custom',
      message: '',
      resultAssetId: undefined,
      sourceAssetId: sourceAsset?.id,
      sourceAspectRatio,
    });
  }, [node.id, sourceAsset?.height, sourceAsset?.id, sourceAsset?.width, updateNodeData]);

  const handlePixelSizeChange = useCallback((dimension: 'width' | 'height', value: string) => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || !sourceAsset?.width || !sourceAsset.height) return;

    const ratio = data.locked
      ? aspectRatioValue(data.aspectRatio, crop, sourceAsset.width, sourceAsset.height)
      : null;
    const nextCrop = cropFromPixelSize({
      crop,
      height: sourceAsset.height,
      locked: data.locked,
      pixelHeight: dimension === 'height' ? nextValue : undefined,
      pixelWidth: dimension === 'width' ? nextValue : undefined,
      ratio,
      width: sourceAsset.width,
    });

    updateNodeData(node.id, {
      aspectRatio: data.locked ? data.aspectRatio : 'Custom',
      crop: nextCrop,
      cropStateVersion: CROP_STATE_VERSION,
      message: '',
    });
  }, [crop, data.aspectRatio, data.locked, node.id, sourceAsset?.height, sourceAsset?.width, updateNodeData]);

  return {
    aspectRatio: data.aspectRatio || 'Custom',
    aspectRatioOptions: cropAspectRatioSelectOptions,
    crop,
    data,
    handleAspectRatioChange,
    handleCropChange,
    handleCropDragStart,
    handleLockToggle,
    handlePixelSizeChange,
    handleReset,
    locked: Boolean(data.locked),
    message: data.message,
    pixelSize,
    resultAsset,
    sourceAsset,
  };
}

function getSourceAspectRatioLabel(width: number, height: number) {
  const ratio = width / height;
  const match = cropAspectRatioSelectOptions.find((option) => {
    if (option.value === 'Custom') return false;
    const [optionWidth, optionHeight] = option.value.split(':').map(Number);
    return Math.abs(optionWidth / optionHeight - ratio) < 0.01;
  });

  return match?.value ?? 'Custom';
}

function getCropForSourceChange({
  crop,
  nextSourceAspectRatio,
  previousSourceAspectRatio,
  selectedAspectRatio,
}: {
  crop: CropRect;
  nextSourceAspectRatio?: number;
  previousSourceAspectRatio?: number;
  selectedAspectRatio?: string;
}) {
  if (!nextSourceAspectRatio) return crop;

  const fixedOutputAspectRatio = selectedAspectRatio ? aspectRatioValue(selectedAspectRatio) : null;
  const customOutputAspectRatio = previousSourceAspectRatio && crop.height > 0
    ? (crop.width * previousSourceAspectRatio) / crop.height
    : null;
  const outputAspectRatio = fixedOutputAspectRatio ?? customOutputAspectRatio;

  return outputAspectRatio
    ? fitCropToOutputAspectPreservingOrigin(crop, nextSourceAspectRatio, outputAspectRatio)
    : crop;
}
