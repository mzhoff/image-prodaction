'use client';

import { SlidersHorizontal } from '@prodactionpro/ui-core/icons';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { useAdjustmentNodeModel } from '../../model/use-adjustment-node-model';
import { AdjustmentControls, AdjustmentResetButton } from '../adjustment-controls';
import { AdjustmentPreview } from '../adjustment-preview';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function AdjustmentNode({ node }: { node: ProductionNode }) {
  const model = useAdjustmentNodeModel(node);
  const sourceRatio = model.sourceAsset?.width && model.sourceAsset.height
    ? `${model.sourceAsset.width}:${model.sourceAsset.height}`
    : undefined;
  const controls = <AdjustmentControls values={model.values} onChange={model.handleAdjustmentChange}
    onReset={model.handleAdjustmentReset} onInteractionStart={model.handleAdjustmentStart} />;

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <ImagePlate assetId={model.displayAsset?.id} aspectRatio={sourceRatio} outputPending={model.outputPending}
        previewMedia={model.sourceAsset ? <AdjustmentPreview assetId={model.sourceAsset.id} aspectRatio={sourceRatio} values={model.values} /> : undefined}
        viewerMedia={<AdjustmentPreview assetId={model.sourceAsset?.id} aspectRatio={sourceRatio} values={model.values} variant="viewer" />}
        viewerPanel={{ active: true, placement: 'right', label: 'Adjustments', className: 'image-editor-panel-adjustment',
          toolbar: <span className="curves-viewer-toolbar-label"><SlidersHorizontal size={15} />Adjustments</span>,
          body: <>{controls}<AdjustmentResetButton onReset={model.handleReset} />
            {model.message ? <div className="node-note" role="alert">{model.message}</div> : null}</>,
        }} />
      <AdjustmentResetButton onReset={model.handleReset} />
      <CollapsibleSection title="Settings">
        {controls}
      </CollapsibleSection>
    </>
  );
}
