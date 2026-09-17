'use client';

import { RotateCcw } from '@prodactionpro/ui-core/icons';
import type { ImageAdjustmentValues } from '@/shared/lib/image-renderer/adjustment-types';
import { RangeSlider } from '@/shared/ui/range-slider';
import { adjustmentControls, type AdjustmentControlId } from '../model/use-adjustment-node-model';

interface AdjustmentControlsProps {
  values: ImageAdjustmentValues;
  onChange: (id: AdjustmentControlId, value: number) => void;
  onReset: (id: AdjustmentControlId) => void;
  onInteractionStart: () => void;
}

export function AdjustmentControls({ values, onChange, onReset, onInteractionStart }: AdjustmentControlsProps) {
  return <div className="adjustment-slider-list">
    {adjustmentControls.map((control) => (
      <RangeSlider key={control.id} label={control.label} ariaLabel={control.label}
        max={control.max} min={control.min} step={control.step} fillMode="center"
        value={values[control.id]} onChange={(value) => onChange(control.id, value)}
        onReset={() => onReset(control.id)} onInteractionStart={onInteractionStart} />
    ))}
  </div>;
}

export function AdjustmentResetButton({ onReset }: { onReset: () => void }) {
  return <button type="button" className="adjustment-reset-button" onClick={onReset} data-node-interactive>
    <RotateCcw size={15} /><span>Reset</span>
  </button>;
}
