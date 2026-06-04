'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { RangeSlider } from '@/shared/ui/range-slider';
import { frequencyRetouchControls, useFrequencyRetouchNodeModel } from '../../model/use-frequency-retouch-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function FrequencyRetouchNode({ node }: { node: ProductionNode }) {
  const model = useFrequencyRetouchNodeModel(node);

  return (
    <>
      <NodeTitle title="Retouch" muted />
      <ImagePlate
        assetId={model.displayAsset?.id}
        loading={model.processing}
        maskDataUrl={model.data.maskDataUrl}
        onMaskChange={model.handleMaskChange}
      />
      <button
        type="button"
        className="adjustment-reset-button"
        onClick={model.handleReset}
        data-node-interactive
      >
        {model.processing ? <Loader2 className="spin" size={15} /> : <RotateCcw size={15} />}
        <span>Reset</span>
      </button>
      <CollapsibleSection title="Frequency">
        <div className="adjustment-slider-list">
          {frequencyRetouchControls.map((control) => (
            <RangeSlider
              key={control.id}
              label={control.label}
              max={control.max}
              min={control.min}
              step={control.step}
              value={model.values[control.id]}
              valueLabel={control.valueLabel(model.values[control.id])}
              onChange={(value) => model.handleRetouchChange(control.id, value)}
              onReset={() => model.handleRetouchReset(control.id)}
              onInteractionStart={model.handleRetouchStart}
            />
          ))}
        </div>
      </CollapsibleSection>
      <div className="node-note node-note-compact">
        WebGL frequency separation: tone is smoothed while texture is recombined from the original image.
      </div>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
