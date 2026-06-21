'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import type { CompositionLayerView } from '../../model/use-composition-node-model';
import type { LayerBounds, ResizeHandle } from './composition-types';
import { getCssBlendMode, toCanvasRelativeUnit } from './composition-canvas-geometry';

export function CompositionLayerFrame({
  canvasHeight,
  canvasWidth,
  hovered,
  interactive,
  layer,
  locked,
  onHoverChange,
  onPointerDown,
  onSelect,
  selected,
}: {
  canvasHeight: number;
  canvasWidth: number;
  hovered: boolean;
  interactive?: boolean;
  layer: CompositionLayerView;
  locked: boolean;
  onHoverChange: (hovered: boolean) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const url = useAssetUrl(layer.assetId);
  const style: CSSProperties = {
    height: `${(layer.style.height / canvasHeight) * 100}%`,
    left: `${(layer.style.x / canvasWidth) * 100}%`,
    mixBlendMode: getCssBlendMode(layer.style.blendMode),
    opacity: layer.style.opacity / 100,
    top: `${(layer.style.y / canvasHeight) * 100}%`,
    transform: `rotate(${layer.style.rotation}deg) scale(${layer.style.flipX ? -1 : 1}, ${layer.style.flipY ? -1 : 1})`,
    width: `${(layer.style.width / canvasWidth) * 100}%`,
  };

  return (
    <button
      type="button"
      className={[
        'composition-preview-layer',
        hovered ? 'composition-preview-layer-hovered' : '',
        selected ? 'composition-preview-layer-selected-underlay' : '',
        locked ? 'composition-preview-layer-locked' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      onClick={onSelect}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onPointerDown={onPointerDown}
    >
      {layer.kind === 'image' && url ? (
        <img src={url} alt={layer.name} draggable={false} style={{ objectFit: layer.style.fit === 'fill' ? 'cover' : layer.style.fit === 'stretch' ? 'fill' : 'contain' }} />
      ) : (
        <span
          className="composition-preview-text"
          style={{
            color: layer.style.color,
            fontFamily: layer.style.fontFamily,
            fontSize: toCanvasRelativeUnit(layer.style.fontSize, canvasWidth),
            fontWeight: layer.style.fontWeight,
            letterSpacing: toCanvasRelativeUnit((layer.style.fontSize * layer.style.letterSpacing) / 100, canvasWidth),
            lineHeight: toCanvasRelativeUnit(layer.style.lineHeight, canvasWidth),
            textAlign: layer.style.align,
          }}
        >
          {layer.text || layer.name}
        </span>
      )}
    </button>
  );
}

export function CompositionLayerOutlineFrame({
  bounds,
  canvasHeight,
  canvasWidth,
}: {
  bounds: LayerBounds;
  canvasHeight: number;
  canvasWidth: number;
}) {
  return (
    <div
      className="composition-hover-frame"
      style={{
        height: `${(bounds.height / canvasHeight) * 100}%`,
        left: `${(bounds.x / canvasWidth) * 100}%`,
        top: `${(bounds.y / canvasHeight) * 100}%`,
        width: `${(bounds.width / canvasWidth) * 100}%`,
      }}
    />
  );
}

export function CompositionSelectionFrame({
  bounds,
  canvasHeight,
  canvasWidth,
  label,
  onPointerDown,
  onResizePointerDown,
}: {
  bounds: LayerBounds;
  canvasHeight: number;
  canvasWidth: number;
  label?: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLSpanElement>, handle: ResizeHandle) => void;
}) {
  return (
    <div
      className="composition-selection-frame"
      style={{
        height: `${(bounds.height / canvasHeight) * 100}%`,
        left: `${(bounds.x / canvasWidth) * 100}%`,
        top: `${(bounds.y / canvasHeight) * 100}%`,
        width: `${(bounds.width / canvasWidth) * 100}%`,
      }}
      onPointerDown={onPointerDown}
    >
      {label ? <span className="composition-preview-layer-label">{label}</span> : null}
      <CompositionResizeHandles onResizePointerDown={onResizePointerDown} />
    </div>
  );
}

export function CompositionResizeHandles({
  onResizePointerDown,
}: {
  onResizePointerDown?: (event: ReactPointerEvent<HTMLSpanElement>, handle: ResizeHandle) => void;
}) {
  return (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
    <span
      key={handle}
      className={`composition-resize-handle composition-resize-handle-${handle}`}
      onPointerDown={(event) => onResizePointerDown?.(event, handle)}
    />
  ));
}
