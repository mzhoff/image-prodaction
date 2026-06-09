'use client';

import { RotateCcw } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { RangeSlider } from '@/shared/ui/range-slider';
import { adjustmentControls, useAdjustmentNodeModel } from '../../model/use-adjustment-node-model';
import { AdjustmentPreview } from '../adjustment-preview';
import { NodeTitle } from '../node-title';

export function AdjustmentNode({ node }: { node: ProductionNode }) {
  const model = useAdjustmentNodeModel(node);
  const sourceRatio = model.sourceAsset?.width && model.sourceAsset.height
    ? `${model.sourceAsset.width}:${model.sourceAsset.height}`
    : undefined;

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <AdjustmentPreview assetId={model.sourceAsset?.id} aspectRatio={sourceRatio} values={model.values} />
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
        <div className="adjustment-slider-list">
          {adjustmentControls.map((control) => (
            <RangeSlider
              key={control.id}
              label={control.label}
              max={control.max}
              min={control.min}
              step={control.step}
              fillMode="center"
              value={model.values[control.id]}
              onChange={(value) => model.handleAdjustmentChange(control.id, value)}
              onReset={() => model.handleAdjustmentReset(control.id)}
              onInteractionStart={model.handleAdjustmentStart}
            />
          ))}
        </div>
      </CollapsibleSection>
    </>
  );
}
