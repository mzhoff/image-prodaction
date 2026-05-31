'use client';

import { RotateCcw } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
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
  const previewStyle = model.displayAsset?.id === model.sourceAsset?.id
    ? { filter: buildAdjustmentPreviewFilter(model.values) } satisfies CSSProperties
    : undefined;

  return (
    <>
      <NodeTitle title="Adjustments" muted />
      <ImagePlate assetId={model.displayAsset?.id} aspectRatio={sourceRatio} mediaStyle={previewStyle} />
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
              onReset={model.handleAdjustmentReset}
              onStart={model.handleAdjustmentStart}
            />
          ))}
        </div>
      </CollapsibleSection>
    </>
  );
}

function AdjustmentSlider({
  id,
  label,
  max,
  min,
  onChange,
  onReset,
  onStart,
  step,
  value,
}: {
  id: AdjustmentControlId;
  label: string;
  max: number;
  min: number;
  onChange: (id: AdjustmentControlId, value: number) => void;
  onReset: (id: AdjustmentControlId) => void;
  onStart: () => void;
  step: number;
  value: number;
}) {
  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.detail <= 1) onStart();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      onStart();
    }
  };
  const progress = ((value - min) / (max - min)) * 100;
  const center = ((0 - min) / (max - min)) * 100;
  const fillStart = Math.min(center, progress);
  const fillEnd = Math.max(center, progress);
  const sliderStyle = {
    '--adjustment-fill-left': `${fillStart}%`,
    '--adjustment-fill-width': `${fillEnd - fillStart}%`,
  } as CSSProperties;

  return (
    <label className="adjustment-slider-row" data-node-interactive>
      <span>{label}</span>
      <div className="adjustment-slider-control" style={sliderStyle}>
        <span className="adjustment-slider-rail" aria-hidden="true">
          <span className="adjustment-slider-fill" />
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="adjustment-slider"
          onChange={(event) => onChange(id, Number(event.target.value))}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onReset(id);
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
        />
      </div>
    </label>
  );
}

function buildAdjustmentPreviewFilter(values: Record<AdjustmentControlId, number>) {
  const brightness = clamp(1 + values.exposure / 180 + values.gamma / 260 + values.highlights / 420 + values.shadows / 520, 0.2, 2.4);
  const contrast = clamp(1 + values.contrast / 100 + values.highlights / 520 - values.shadows / 650, 0.2, 2.5);
  const saturation = clamp(1 + values.saturation / 100 + Math.abs(values.tint) / 900, 0, 2.8);
  const hueRotate = clamp(values.temperature * 0.16 + values.tint * 0.28, -35, 35);
  const sepia = clamp(Math.abs(values.temperature) / 550 + Math.abs(values.tint) / 750, 0, 0.28);

  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) sepia(${sepia}) hue-rotate(${hueRotate}deg)`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
