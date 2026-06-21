'use client';

import { Maximize2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DarkSelect } from '@/shared/ui/dark-select';
import { compositionAspectRatioOptions, useCompositionNodeModel } from '../../model/use-composition-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';
import { CompositionCanvas } from '../composition-editor/composition-canvas';
import { CompositionEditorOverlay } from '../composition-editor/composition-editor-overlay';

export function CompositionNode({ node }: { node: ProductionNode }) {
  const model = useCompositionNodeModel(node);
  const previewRatio = `${model.canvasWidth} / ${model.canvasHeight}`;
  const [editorOpen, setEditorOpen] = useState(false);
  const hasOutgoingEdge = useProductionGraphStore((state) => state.edges.some((edge) => edge.sourceNodeId === node.id));
  const autoComposeSignatureRef = useRef<string | undefined>(undefined);
  const handleEditorClose = () => {
    setEditorOpen(false);
    void model.handleCompose();
  };

  useEffect(() => {
    if (!model.resultStale) {
      autoComposeSignatureRef.current = undefined;
      return;
    }
    if (editorOpen) return;
    if (node.status === 'running') return;
    if (!hasOutgoingEdge && !model.data.resultAssetId) return;
    if (autoComposeSignatureRef.current === model.resultSignature) return;

    autoComposeSignatureRef.current = model.resultSignature;
    void model.handleCompose({ silent: true });
  }, [
    editorOpen,
    hasOutgoingEdge,
    model.data.resultAssetId,
    model.resultSignature,
    model.resultStale,
    node.status,
  ]);

  return (
    <>
      <NodeTitle title={model.data.title} nodeType={node.type} muted />
      <div className="composition-node-body">
        <div className="composition-settings-row">
          <label>
            <span>Aspect</span>
            <DarkSelect value={model.data.aspectRatio} options={compositionAspectRatioOptions} onChange={model.handleAspectRatioChange} />
          </label>
          <label>
            <span>Size</span>
            <DarkSelect value={model.selectedSize} options={model.sizeOptions} onChange={model.handleSizeChange} />
          </label>
        </div>

        {model.resultAssetId ? (
          <ImagePlate assetId={model.resultAssetId} aspectRatio={previewRatio} compact />
        ) : (
          <CompositionCanvas
            canvasHeight={model.canvasHeight}
            canvasWidth={model.canvasWidth}
            layers={model.visibleConnectedLayers}
            selectedLayerIds={[]}
            onSelectLayer={() => undefined}
            previewStyle={{ aspectRatio: previewRatio }}
          />
        )}

        <div className="composition-actions">
          <button type="button" className="text-concat-add-button composition-add-layer-button" onClick={model.handleAddLayer}>
            <Plus size={14} />
            <span>Add layer</span>
          </button>
          <button type="button" className="secondary-node-button composition-open-editor-button" onClick={() => setEditorOpen(true)}>
            <Maximize2 size={15} />
            <span>Edit</span>
          </button>
        </div>

        {model.data.message ? <div className="node-note node-note-compact composition-message">{model.data.message}</div> : null}
      </div>
      {editorOpen ? createPortal(<CompositionEditorOverlay model={model} onClose={handleEditorClose} />, document.body) : null}
    </>
  );
}
