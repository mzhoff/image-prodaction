'use client';

import { ImagePlus, Upload, X } from 'lucide-react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import { saveBannerAsset } from '@/entities/production-graph/lib/banner-asset';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import type { BannerNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';

interface BannerNodeProps {
  node: ProductionNode;
  selected: boolean;
}

type BannerResizeHandle = 'sw' | 'se';

const MIN_BANNER_WIDTH = 120;
const MAX_BANNER_WIDTH = 1200;
const MIN_BANNER_HEIGHT = 48;
const MAX_BANNER_HEIGHT = 800;

export function BannerNode({ node, selected }: BannerNodeProps) {
  const data = node.data as BannerNodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const url = useAssetUrl(data.assetId);
  const assignBannerAssetToNode = useProductionGraphStore((state) => state.assignBannerAssetToNode);
  const deleteSelected = useProductionGraphStore((state) => state.deleteSelected);
  const resizeNodeFrame = useProductionGraphStore((state) => state.resizeNodeFrame);
  const selectNode = useProductionGraphStore((state) => state.selectNode);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      updateNodeDataSilent(node.id, { message: 'Converting to WebP...' });
      const asset = await saveBannerAsset(file);
      assignBannerAssetToNode(node.id, asset);
    } catch (error) {
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'Could not import banner.',
      });
    }
  };

  const handleDelete = () => {
    selectNode(node.id);
    window.requestAnimationFrame(() => deleteSelected());
  };

  const handleResizePointerDown = (handle: BannerResizeHandle, event: ReactPointerEvent<HTMLDivElement>) => {
    if (node.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest<HTMLElement>('[data-node-id]');
    if (!card) return;

    const startClient = { x: event.clientX, y: event.clientY };
    const startPosition = { ...node.position };
    const startSize = { ...node.size };
    const cardRect = card.getBoundingClientRect();
    const zoom = cardRect.width > 0 ? cardRect.width / Math.max(startSize.width, 1) : 1;
    let nextFrame = { position: startPosition, size: startSize };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClient.x) / zoom;
      const deltaY = (moveEvent.clientY - startClient.y) / zoom;
      const widthDelta = handle === 'sw' ? -deltaX : deltaX;
      const nextWidth = clamp(Math.round(startSize.width + widthDelta), MIN_BANNER_WIDTH, MAX_BANNER_WIDTH);
      const nextHeight = clamp(Math.round(startSize.height + deltaY), MIN_BANNER_HEIGHT, MAX_BANNER_HEIGHT);
      const nextX = handle === 'sw' ? startPosition.x + startSize.width - nextWidth : startPosition.x;

      nextFrame = {
        position: { x: nextX, y: startPosition.y },
        size: { width: nextWidth, height: nextHeight },
      };
      card.style.left = `${nextFrame.position.x}px`;
      card.style.top = `${nextFrame.position.y}px`;
      card.style.width = `${nextFrame.size.width}px`;
      card.style.height = `${nextFrame.size.height}px`;
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (
        nextFrame.position.x !== node.position.x
        || nextFrame.position.y !== node.position.y
        || nextFrame.size.width !== node.size.width
        || nextFrame.size.height !== node.size.height
      ) {
        resizeNodeFrame(node.id, nextFrame);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div className={cn('banner-node-body', selected && 'banner-node-body-selected')}>
      <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/*" hidden onChange={handleUpload} />
      {url ? (
        <img className="banner-node-image" src={url} alt={data.title || 'Banner'} draggable={false} />
      ) : (
        <div className="banner-node-empty">
          <button
            type="button"
            className="banner-node-upload-button"
            data-node-interactive
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <ImagePlus size={24} />
            <span>Upload banner PNG</span>
          </button>
        </div>
      )}
      {selected ? (
        <>
          <div className="banner-node-selection-fill" />
          <button
            type="button"
            className="banner-node-close"
            aria-label="Delete banner"
            data-node-interactive
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              handleDelete();
            }}
          >
            <X size={12} />
          </button>
          {!node.locked ? (
            <>
              <div
                className="banner-node-resize-handle banner-node-resize-sw"
                data-node-interactive
                onPointerDown={(event) => handleResizePointerDown('sw', event)}
              />
              <div
                className="banner-node-resize-handle banner-node-resize-se"
                data-node-interactive
                onPointerDown={(event) => handleResizePointerDown('se', event)}
              />
            </>
          ) : null}
        </>
      ) : null}
      {data.message ? (
        <div className="banner-node-message">
          <Upload size={12} />
          <span>{data.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
