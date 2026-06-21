'use client';

import { Layers } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import type { CompositionLayerView } from '../../model/use-composition-node-model';
import type { CompositionEditorTool, ResizeHandle } from './composition-types';
import { CompositionLayerFrame, CompositionLayerOutlineFrame, CompositionResizeHandles, CompositionSelectionFrame } from './composition-canvas-frames';
import { clampLayerValue, getCompositionLayerBounds, getResizePatch, scaleLayerWithinBounds } from './composition-canvas-geometry';
import { useCompositionLayerDrafts } from './use-composition-layer-drafts';

export function CompositionCanvas({
  canvasHeight,
  canvasWidth,
  canvasAspectRatioLocked,
  className,
  editorTool = 'select',
  highlightedLayerId,
  interactive,
  layers,
  onCommitCanvasSize,
  onCommitLayerSnapshots,
  onIsLayerLocked,
  onSelectLayer,
  onUpdateCanvasSizeSilent,
  onUpdateLayersSilent,
  previewStyle,
  selectedLayerIds,
}: {
  canvasHeight: number;
  canvasWidth: number;
  canvasAspectRatioLocked?: boolean;
  className?: string;
  editorTool?: CompositionEditorTool;
  highlightedLayerId?: string;
  interactive?: boolean;
  layers: CompositionLayerView[];
  onCommitCanvasSize?: () => void;
  onCommitLayerSnapshots?: (layerIds: string[]) => void;
  onIsLayerLocked?: (layer: CompositionLayerView) => boolean;
  onSelectLayer: (layerId: string, additive?: boolean) => void;
  onUpdateCanvasSizeSilent?: (width: number, height: number, aspectRatio?: string) => void;
  onUpdateLayersSilent?: (patches: Array<{ layerId: string; patch: Partial<CompositionLayerStyle> }>) => void;
  previewStyle?: CSSProperties;
  selectedLayerIds?: string[];
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSelected, setCanvasSelected] = useState(false);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | undefined>();
  const { commitLayerDrafts, draftLayerPatches, scheduleLayerDrafts } = useCompositionLayerDrafts(onUpdateLayersSilent);
  const canvasStyle = {
    ...(previewStyle ?? { aspectRatio: `${canvasWidth} / ${canvasHeight}` }),
    '--composition-ratio': String(canvasWidth / Math.max(1, canvasHeight)),
  } as CSSProperties;
  const displayLayers = useMemo(() => layers.map((layer) => {
    const draft = draftLayerPatches[layer.id];
    return draft ? { ...layer, style: { ...layer.style, ...draft } } : layer;
  }), [draftLayerPatches, layers]);
  const selectedLayers = useMemo(() => displayLayers.filter((layer) => selectedLayerIds?.includes(layer.id)), [displayLayers, selectedLayerIds]);
  const singleSelectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : undefined;
  const activeHoverLayerId = hoveredLayerId ?? highlightedLayerId;
  const hoveredLayer = activeHoverLayerId && !selectedLayerIds?.includes(activeHoverLayerId)
    ? displayLayers.find((layer) => layer.id === activeHoverLayerId)
    : undefined;
  const multiSelectionBounds = selectedLayers.length > 1 ? getCompositionLayerBounds(selectedLayers) : undefined;

  const getGestureMetrics = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return {
      rect,
      scaleX: canvasWidth / rect.width,
      scaleY: canvasHeight / rect.height,
    };
  };

  const startLayerGesture = (
    event: ReactPointerEvent<HTMLElement>,
    layer: CompositionLayerView,
    mode: 'drag' | 'resize',
    handle?: ResizeHandle,
  ) => {
    if (!interactive || editorTool !== 'select' || event.button !== 0) return;
    if (onIsLayerLocked?.(layer)) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasSelected(false);
    const layerSelected = Boolean(selectedLayerIds?.includes(layer.id));
    if (!layerSelected) onSelectLayer(layer.id, event.metaKey || event.ctrlKey);
    const metrics = getGestureMetrics();
    if (!metrics) return;
    const gestureLayers = mode === 'drag' && layerSelected
      ? displayLayers.filter((item) => selectedLayerIds?.includes(item.id) && !onIsLayerLocked?.(item))
      : [layer];
    const startLayers = gestureLayers.map((item) => ({
      id: item.id,
      height: item.style.height,
      preserveAspectRatio: item.style.preserveAspectRatio,
      width: item.style.width,
      x: item.style.x,
      y: item.style.y,
    }));
    const start = { clientX: event.clientX, clientY: event.clientY };
    onCommitLayerSnapshots?.(startLayers.map((item) => item.id));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.clientX) * metrics.scaleX;
      const dy = (moveEvent.clientY - start.clientY) * metrics.scaleY;
      scheduleLayerDrafts(startLayers.map((item) => ({
        layerId: item.id,
        patch: mode === 'drag'
          ? {
            x: clampLayerValue(item.x + dx, -canvasWidth, canvasWidth * 2),
            y: clampLayerValue(item.y + dy, -canvasHeight, canvasHeight * 2),
          }
          : getResizePatch(item, dx, dy, handle ?? 'se', moveEvent.shiftKey || item.preserveAspectRatio),
      })));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      commitLayerDrafts();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  };

  const startSelectionGesture = (event: ReactPointerEvent<HTMLElement>, mode: 'drag' | 'resize', handle?: ResizeHandle) => {
    if (!interactive || editorTool !== 'select' || event.button !== 0 || selectedLayers.length < 2 || !multiSelectionBounds) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasSelected(false);
    const metrics = getGestureMetrics();
    if (!metrics) return;
    const gestureLayers = selectedLayers.filter((layer) => !onIsLayerLocked?.(layer));
    const startLayers = gestureLayers.map((layer) => ({
      id: layer.id,
      height: layer.style.height,
      width: layer.style.width,
      x: layer.style.x,
      y: layer.style.y,
    }));
    const startBounds = multiSelectionBounds;
    const start = { clientX: event.clientX, clientY: event.clientY };
    onCommitLayerSnapshots?.(startLayers.map((layer) => layer.id));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.clientX) * metrics.scaleX;
      const dy = (moveEvent.clientY - start.clientY) * metrics.scaleY;
      if (mode === 'drag') {
        scheduleLayerDrafts(startLayers.map((layer) => ({
          layerId: layer.id,
          patch: {
            x: clampLayerValue(layer.x + dx, -canvasWidth, canvasWidth * 2),
            y: clampLayerValue(layer.y + dy, -canvasHeight, canvasHeight * 2),
          },
        })));
        return;
      }
      const nextBounds = getResizePatch(startBounds, dx, dy, handle ?? 'se', moveEvent.shiftKey);
      scheduleLayerDrafts(startLayers.map((layer) => ({
        layerId: layer.id,
        patch: scaleLayerWithinBounds(layer, startBounds, {
          height: nextBounds.height ?? startBounds.height,
          width: nextBounds.width ?? startBounds.width,
          x: nextBounds.x ?? startBounds.x,
          y: nextBounds.y ?? startBounds.y,
        }),
      })));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      commitLayerDrafts();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  };

  const startCanvasResize = (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle) => {
    if (!interactive || editorTool !== 'select' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasSelected(true);
    const metrics = getGestureMetrics();
    if (!metrics) return;
    const start = { clientX: event.clientX, clientY: event.clientY, height: canvasHeight, width: canvasWidth, x: 0, y: 0 };
    onCommitCanvasSize?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.clientX) * metrics.scaleX;
      const dy = (moveEvent.clientY - start.clientY) * metrics.scaleY;
      const keepRatio = Boolean(canvasAspectRatioLocked);
      const next = getResizePatch(start, dx, dy, handle, keepRatio);
      onUpdateCanvasSizeSilent?.(next.width ?? canvasWidth, next.height ?? canvasHeight);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div
      ref={canvasRef}
      className={[
        'composition-preview',
        className,
        interactive ? 'composition-preview-interactive' : '',
        canvasSelected ? 'composition-preview-canvas-selected' : '',
      ].filter(Boolean).join(' ')}
      style={canvasStyle}
      onPointerDown={(event) => {
        if (!interactive || editorTool !== 'select') return;
        if (event.target !== event.currentTarget) return;
        setCanvasSelected(true);
      }}
    >
      {interactive && editorTool === 'select' && canvasSelected ? (
        <CompositionResizeHandles onResizePointerDown={startCanvasResize} />
      ) : null}
      {displayLayers.length === 0 ? (
        <div className="composition-preview-empty">
          <Layers size={22} />
        </div>
      ) : null}
      {displayLayers.map((layer) => (
        <CompositionLayerFrame
          key={layer.id}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          interactive={interactive}
          layer={layer}
          locked={Boolean(onIsLayerLocked?.(layer))}
          selected={Boolean(selectedLayerIds?.includes(layer.id))}
          hovered={activeHoverLayerId === layer.id}
          onPointerDown={(event) => startLayerGesture(event, layer, 'drag')}
          onHoverChange={(hovered) => setHoveredLayerId(hovered ? layer.id : undefined)}
          onSelect={() => {
            if (!interactive || editorTool !== 'select') return;
            setCanvasSelected(false);
            onSelectLayer(layer.id);
          }}
        />
      ))}
      {interactive && hoveredLayer ? (
        <CompositionLayerOutlineFrame
          bounds={hoveredLayer.style}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
        />
      ) : null}
      {interactive && editorTool === 'select' && singleSelectedLayer ? (
        <CompositionSelectionFrame
          bounds={singleSelectedLayer.style}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          label={singleSelectedLayer.name}
          onPointerDown={(event) => startLayerGesture(event, singleSelectedLayer, 'drag')}
          onResizePointerDown={(event, handle) => startLayerGesture(event, singleSelectedLayer, 'resize', handle)}
        />
      ) : null}
      {interactive && editorTool === 'select' && multiSelectionBounds ? (
        <CompositionSelectionFrame
          bounds={multiSelectionBounds}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          onPointerDown={(event) => startSelectionGesture(event, 'drag')}
          onResizePointerDown={(event, handle) => startSelectionGesture(event, 'resize', handle)}
        />
      ) : null}
    </div>
  );
}
