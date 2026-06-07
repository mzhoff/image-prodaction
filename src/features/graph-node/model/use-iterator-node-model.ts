'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  getIncomingImageCollectionInputs,
  getIncomingTextCollectionInputs,
  type GraphImageInputItem,
  type GraphTextInputItem,
} from '@/entities/production-graph/model/graph-io';
import type { IteratorActiveKind, IteratorNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

export function useIteratorNodeModel(node: ProductionNode) {
  const data = node.data as IteratorNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);

  const imageItems = useMemo(() => sortImageItems(
    getIncomingImageCollectionInputs(node.id, 'imageCollection', { assets, edges, nodes }),
  ), [assets, edges, node.id, nodes]);
  const textItems = useMemo(() => sortTextItems(
    getIncomingTextCollectionInputs(node.id, 'textCollection', { edges, nodes }),
  ), [edges, node.id, nodes]);

  const activeKind = resolveActiveKind(data.activeKind, imageItems.length, textItems.length);
  const activeItemsCount = activeKind === 'image' ? imageItems.length : textItems.length;
  const activeIndex = getSafeIndex(data.activeIndex, activeItemsCount);
  const activeImageItem = activeKind === 'image' ? imageItems[activeIndex] : undefined;
  const activeTextItem = activeKind === 'text' ? textItems[activeIndex] : undefined;
  const activeImageAssetId = activeImageItem?.assetId;
  const activeText = activeTextItem?.text ?? '';
  const message = getIteratorMessage(activeKind, imageItems.length, textItems.length);

  useEffect(() => {
    if (
      data.activeKind === activeKind
      && data.activeIndex === activeIndex
      && data.activeImageAssetId === activeImageAssetId
      && (data.activeText ?? '') === activeText
      && data.imageCount === imageItems.length
      && data.textCount === textItems.length
      && (data.message ?? '') === message
    ) {
      return;
    }

    updateNodeDataSilent(node.id, {
      activeKind,
      activeIndex,
      activeImageAssetId,
      activeText,
      imageCount: imageItems.length,
      textCount: textItems.length,
      message,
    });
  }, [
    activeImageAssetId,
    activeIndex,
    activeKind,
    activeText,
    data.activeImageAssetId,
    data.activeIndex,
    data.activeKind,
    data.activeText,
    data.imageCount,
    data.message,
    data.textCount,
    imageItems.length,
    message,
    node.id,
    textItems.length,
    updateNodeDataSilent,
  ]);

  const handleKindChange = useCallback((kind: string) => {
    updateNodeData(node.id, {
      activeKind: kind === 'text' ? 'text' : 'image',
      activeIndex: 0,
    });
  }, [node.id, updateNodeData]);

  const handleIndexChange = useCallback((index: number) => {
    updateNodeData(node.id, { activeIndex: activeItemsCount > 0 ? getSafeIndex(index, activeItemsCount) : 0 });
  }, [activeItemsCount, node.id, updateNodeData]);

  const handleIndexSelectChange = useCallback((index: string) => {
    handleIndexChange(Number(index));
  }, [handleIndexChange]);

  const handlePrevious = useCallback(() => {
    updateNodeData(node.id, { activeIndex: wrapIndex(activeIndex - 1, activeItemsCount) });
  }, [activeIndex, activeItemsCount, node.id, updateNodeData]);

  const handleNext = useCallback(() => {
    updateNodeData(node.id, { activeIndex: wrapIndex(activeIndex + 1, activeItemsCount) });
  }, [activeIndex, activeItemsCount, node.id, updateNodeData]);

  const kindOptions = useMemo(() => [
    { value: 'image', label: `Images ${imageItems.length}` },
    { value: 'text', label: `Texts ${textItems.length}` },
  ], [imageItems.length, textItems.length]);

  const indexOptions = useMemo(() => (
    Array.from({ length: activeItemsCount }, (_, index) => ({
      value: String(index),
      label: `Item ${index + 1}`,
    }))
  ), [activeItemsCount]);

  return {
    activeImageAssetId,
    activeIndex,
    activeItemsCount,
    activeKind,
    activeText,
    data,
    handleIndexChange,
    handleIndexSelectChange,
    handleKindChange,
    handleNext,
    handlePrevious,
    imageAssetIds: imageItems.map((item) => item.assetId),
    imageCount: imageItems.length,
    indexOptions,
    kindOptions,
    message,
    textCount: textItems.length,
  };
}

function sortImageItems(items: GraphImageInputItem[]) {
  return [...items].sort((first, second) => compareCollectionItems(first, second));
}

function sortTextItems(items: GraphTextInputItem[]) {
  return [...items].sort((first, second) => compareCollectionItems(first, second));
}

function compareCollectionItems(first: GraphImageInputItem | GraphTextInputItem, second: GraphImageInputItem | GraphTextInputItem) {
  const firstY = first.sourceNode.position.y;
  const secondY = second.sourceNode.position.y;
  if (firstY !== secondY) return firstY - secondY;
  const firstX = first.sourceNode.position.x;
  const secondX = second.sourceNode.position.x;
  if (firstX !== secondX) return firstX - secondX;
  return (first.collectionIndex ?? 0) - (second.collectionIndex ?? 0);
}

function resolveActiveKind(requestedKind: IteratorActiveKind | undefined, imageCount: number, textCount: number): IteratorActiveKind {
  if (requestedKind === 'text' && textCount > 0) return 'text';
  if (requestedKind === 'image' && imageCount > 0) return 'image';
  if (imageCount > 0) return 'image';
  if (textCount > 0) return 'text';
  return requestedKind === 'text' ? 'text' : 'image';
}

function getSafeIndex(index: number | undefined, length: number) {
  if (length <= 0) return 0;
  if (typeof index !== 'number' || Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return (index + length) % length;
}

function getIteratorMessage(activeKind: IteratorActiveKind, imageCount: number, textCount: number) {
  if (imageCount === 0 && textCount === 0) return 'Connect an image or text collection.';
  if (activeKind === 'image' && imageCount === 0) return 'No image collection connected.';
  if (activeKind === 'text' && textCount === 0) return 'No text collection connected.';
  return '';
}
