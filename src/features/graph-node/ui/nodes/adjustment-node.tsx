'use client';

import { RotateCcw } from 'lucide-react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { adjustmentControls, type AdjustmentControlId, useAdjustmentNodeModel } from '../../model/use-adjustment-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function AdjustmentNode({ node }: { node: ProductionNode }) {
  const model = useAdjustmentNodeModel(node);
  const sourceRatio = model.displayAsset?.width && model.displayAsset.height
    ? `${model.displayAsset.width}:${model.displayAsset.height}`
    : undefined;

  return (
    <>
      <NodeTitle title="Adjustments" muted />
      <ImagePlate assetId={model.displayAsset?.id} aspectRatio={sourceRatio} />
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
            <AdjustmentSlider
              key={control.id}
              id={control.id}
              label={control.label}
              max={control.max}
              min={control.min}
              step={control.step}
              value={model.values[control.id]}
              onChange={model.handleAdjustmentChange}
              onStart={model.handleAdjustmentStart}
            />
          ))}
        </div>
      </CollapsibleSection>
      {model.message ? <div className="node-note node-note-compact">{model.message}</div> : null}
    </>
  );
}

function AdjustmentSlider({
  id,
  label,
  max,
  min,
  onChange,
  onStart,
  step,
  value,
}: {
  id: AdjustmentControlId;
  label: string;
  max: number;
  min: number;
  onChange: (id: AdjustmentControlId, value: number) => void;
  onStart: () => void;
  step: number;
  value: number;
}) {
  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onStart();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      onStart();
    }
  };
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <label className="adjustment-slider-row" data-node-interactive>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="adjustment-slider"
        style={{ background: `linear-gradient(90deg, #000 0%, #000 ${progress}%, #e5eeee ${progress}%, #e5eeee 100%)` }}
        onChange={(event) => onChange(id, Number(event.target.value))}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      />
    </label>
  );
}
