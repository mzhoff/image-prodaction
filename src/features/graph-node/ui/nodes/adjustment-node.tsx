'use client';

import { RotateCcw } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { adjustmentControls, type AdjustmentControlId, useAdjustmentNodeModel } from '../../model/use-adjustment-node-model';
import { drawAdjustedImagePreview, type ImageAdjustmentValues } from '../../lib/adjust-image';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function AdjustmentNode({ node }: { node: ProductionNode }) {
  const model = useAdjustmentNodeModel(node);
  const sourceRatio = model.sourceAsset?.width && model.sourceAsset.height
    ? `${model.sourceAsset.width}:${model.sourceAsset.height}`
    : undefined;

  return (
    <>
      <NodeTitle title="Adjustments" muted />
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

function AdjustmentPreview({
  assetId,
  aspectRatio,
  values,
}: {
  assetId?: string;
  aspectRatio?: string;
  values: ImageAdjustmentValues;
}) {
  const url = useAssetUrl(assetId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    imageRef.current = null;

    if (!url) return undefined;

    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setReady(true);
    };
    image.onerror = () => {
      if (!active) return;
      imageRef.current = null;
      setReady(false);
    };
    image.src = url;

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    if (!ready || !canvasRef.current || !imageRef.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (!canvasRef.current || !imageRef.current) return;
      drawAdjustedImagePreview(canvasRef.current, imageRef.current, values);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [ready, values]);

  if (!url) {
    return <ImagePlate assetId={undefined} aspectRatio={aspectRatio} />;
  }

  return (
    <div
      className="image-plate image-plate-sized adjustment-preview"
      style={{ aspectRatio: formatCssAspectRatio(aspectRatio) ?? '1 / 1' }}
      onDragStart={(event) => event.preventDefault()}
    >
      <canvas ref={canvasRef} className="adjustment-preview-canvas" />
    </div>
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

function formatCssAspectRatio(value?: string) {
  const normalized = value?.trim().replace(':', ' / ');
  return normalized && /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined;
}
