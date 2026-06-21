'use client';

import { X } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { clampNumber } from './composition-canvas-geometry';
import { CompositionCanvas } from './composition-canvas';
import { CompositionEditorToolbar } from './composition-editor-toolbar';
import { CompositionLayerControls } from './composition-layer-controls';
import { CompositionLayerTree } from './composition-layer-tree';
import type { CompositionEditorTool, CompositionModel, CompositionShapeTool } from './composition-types';

export function CompositionEditorOverlay({
  model,
  onClose,
}: {
  model: CompositionModel;
  onClose: () => void;
}) {
  const selected = model.selectedLayer;
  const canRedo = useProductionGraphStore((state) => state.historyFuture.length > 0);
  const canUndo = useProductionGraphStore((state) => state.historyPast.length > 0);
  const redo = useProductionGraphStore((state) => state.redo);
  const undo = useProductionGraphStore((state) => state.undo);
  const [activeTool, setActiveTool] = useState<CompositionEditorTool>('select');
  const [shapeTool, setShapeTool] = useState<CompositionShapeTool>('rectangle');
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const stagePanFrameRef = useRef<number | undefined>(undefined);
  const stagePanRef = useRef({ x: 0, y: 0 });
  const pendingStagePanRef = useRef({ x: 0, y: 0 });
  const [highlightedLayerId, setHighlightedLayerId] = useState<string | undefined>();
  const [isStagePanning, setIsStagePanning] = useState(false);
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [stageZoom, setStageZoom] = useState(1);
  useEffect(() => {
    stagePanRef.current = stagePan;
  }, [stagePan]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        model.groupSelectedLayers();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        setActiveTool('select');
        return;
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setActiveTool('hand');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [model]);
  useEffect(() => () => {
    if (stagePanFrameRef.current !== undefined) window.cancelAnimationFrame(stagePanFrameRef.current);
  }, []);

  const startStagePan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setIsStagePanning(true);
    const start = { clientX: event.clientX, clientY: event.clientY, x: stagePanRef.current.x, y: stagePanRef.current.y };
    pendingStagePanRef.current = { x: start.x, y: start.y };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      pendingStagePanRef.current = {
        x: start.x + moveEvent.clientX - start.clientX,
        y: start.y + moveEvent.clientY - start.clientY,
      };
      if (stagePanFrameRef.current !== undefined) return;
      stagePanFrameRef.current = window.requestAnimationFrame(() => {
        stagePanFrameRef.current = undefined;
        setStagePan(pendingStagePanRef.current);
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (stagePanFrameRef.current !== undefined) {
        window.cancelAnimationFrame(stagePanFrameRef.current);
        stagePanFrameRef.current = undefined;
      }
      setStagePan(pendingStagePanRef.current);
      setIsStagePanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  };

  return (
    <div className="composition-editor-overlay">
      <div className="composition-editor-shell">
        <aside className="composition-editor-sidebar">
          <div className="composition-editor-title">
            <strong>{model.data.title}</strong>
            <span>{model.canvasWidth} x {model.canvasHeight}</span>
          </div>
          <CompositionLayerTree model={model} onHoverLayer={setHighlightedLayerId} />
        </aside>

        <main
          className={[
            'composition-editor-stage-wrap',
            activeTool === 'hand' ? 'composition-editor-stage-hand' : '',
            isStagePanning ? 'composition-editor-stage-panning' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={(event) => {
            if (activeTool === 'hand') {
              startStagePan(event);
              return;
            }
            if (event.target !== event.currentTarget) return;
            model.clearSelection();
          }}
          onWheel={(event) => {
            if (!event.altKey) return;
            event.preventDefault();
            setStageZoom((current) => clampNumber(current * (event.deltaY > 0 ? 0.9 : 1.1), 0.25, 3));
          }}
        >
          <div
            className="composition-editor-stage-zoom"
            style={{
              '--composition-stage-pan-x': `${stagePan.x}px`,
              '--composition-stage-pan-y': `${stagePan.y}px`,
              '--composition-stage-zoom': stageZoom,
            } as CSSProperties}
          >
            <CompositionCanvas
              canvasHeight={model.canvasHeight}
              canvasWidth={model.canvasWidth}
              canvasAspectRatioLocked={model.data.aspectRatio !== 'custom'}
              editorTool={activeTool}
              highlightedLayerId={highlightedLayerId}
              className="composition-canvas-fullscreen"
              interactive
              layers={model.visibleConnectedLayers}
              selectedLayerIds={model.selectedLayerIds}
              onCommitLayerSnapshots={model.commitLayerSnapshots}
              onCommitCanvasSize={model.commitCanvasSize}
              onIsLayerLocked={model.isLayerLocked}
              onSelectLayer={model.selectLayer}
              onUpdateCanvasSizeSilent={model.updateCanvasSizeSilent}
              onUpdateLayersSilent={model.updateLayersSilent}
            />
          </div>
          <CompositionEditorToolbar
            activeTool={activeTool}
            canRedo={canRedo}
            canUndo={canUndo}
            onRedo={redo}
            onSelectShape={(shape) => {
              setShapeTool(shape);
              setActiveTool('shape');
              setShapeMenuOpen(false);
            }}
            onSelectTool={setActiveTool}
            onUndo={undo}
            shapeMenuOpen={shapeMenuOpen}
            shapeTool={shapeTool}
            toggleShapeMenu={() => setShapeMenuOpen((open) => !open)}
            zoom={stageZoom}
          />
        </main>

        <aside className="composition-editor-inspector">
          <button type="button" className="composition-editor-close" aria-label="Close editor" onClick={onClose}>
            <X size={18} />
          </button>
          {selected ? (
            <>
              <CompositionLayerControls
                canvasHeight={model.canvasHeight}
                canvasWidth={model.canvasWidth}
                layer={selected}
                onAlignCanvas={(alignment) => model.alignLayerToCanvas(selected.id, alignment)}
                onChange={(patch) => model.updateLayer(selected.id, patch)}
              />
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
