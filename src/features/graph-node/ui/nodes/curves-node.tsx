'use client';

import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { useCurvesNodeModel } from '../../model/use-curves-node-model';
import { CurvesEditor } from '../curves-editor';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function CurvesNode({ node }: { node: ProductionNode }) {
  const model = useCurvesNodeModel(node);
  const sourceRatio = model.sourceAsset?.width && model.sourceAsset.height
    ? `${model.sourceAsset.width}:${model.sourceAsset.height}`
    : undefined;
  const editorProps = {
    activeChannel: model.activeChannel,
    curves: model.curves,
    onActiveChannelChange: model.handleActiveChannelChange,
    onCurveChange: model.handleCurveChange,
    onInteractionStart: model.handleInteractionStart,
    onOpacityChange: model.handleOpacityChange,
    histogram: model.histogram,
    onResetChannel: model.handleResetChannel,
    opacity: model.opacity,
  };

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <ImagePlate
        assetId={model.displayAsset?.id}
        aspectRatio={sourceRatio}
        loading={model.processing}
        maskDataUrl={model.data.maskDataUrl}
        onMaskChange={model.handleMaskChange}
        viewerPanel={{
          active: true,
          body: <CurvesEditor {...editorProps} variant="viewer" />,
          className: 'image-editor-panel-curves',
          height: 362,
          toolbar: (
            <span className="curves-viewer-toolbar-label">
              <SlidersHorizontal size={15} />
              Curves
            </span>
          ),
        }}
      />
      <button
        type="button"
        className="adjustment-reset-button"
        onClick={model.handleReset}
        data-node-interactive
      >
        <RotateCcw size={15} />
        <span>Reset</span>
      </button>
      <CollapsibleSection title="Settings">
        <CurvesEditor {...editorProps} />
        {model.message ? <div className="node-note node-note-compact">{model.message}</div> : null}
      </CollapsibleSection>
    </>
  );
}
