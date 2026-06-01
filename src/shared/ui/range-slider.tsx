'use client';

import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/shared/lib/cn';

interface RangeSliderProps {
  ariaLabel?: string;
  className?: string;
  fillMode?: 'start' | 'center';
  label?: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  onReset?: () => void;
  step?: number;
  value: number;
  valueLabel?: string;
}

export function RangeSlider({
  ariaLabel,
  className,
  fillMode = 'start',
  label,
  max,
  min,
  onChange,
  onInteractionStart,
  onReset,
  step = 1,
  value,
  valueLabel,
}: RangeSliderProps) {
  const range = Math.max(max - min, Number.EPSILON);
  const progress = ((value - min) / range) * 100;
  const center = fillMode === 'center' ? ((0 - min) / range) * 100 : 0;
  const fillStart = Math.min(center, progress);
  const fillEnd = Math.max(center, progress);
  const sliderStyle = {
    '--range-slider-fill-left': `${fillStart}%`,
    '--range-slider-fill-width': `${fillEnd - fillStart}%`,
  } as CSSProperties;

  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.detail <= 1) onInteractionStart?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      onInteractionStart?.();
    }
  };

  return (
    <label className={cn('range-slider-row', !label && 'range-slider-row-value-only', className)} data-node-interactive>
      <span className="range-slider-label">{valueLabel ?? label}</span>
      <span className="range-slider-control" style={sliderStyle}>
        <span className="range-slider-rail" aria-hidden="true">
          <span className="range-slider-fill" />
        </span>
        <input
          type="range"
          aria-label={ariaLabel ?? label ?? valueLabel}
          min={min}
          max={max}
          step={step}
          value={value}
          className="range-slider-input"
          onChange={(event) => onChange(Number(event.target.value))}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onReset?.();
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
        />
      </span>
    </label>
  );
}
