'use client';

import { Eye, Minus, Plus, Trash2 } from 'lucide-react';
import { COMPOSITION_GRADIENT_MAX_STOPS, createDefaultCompositionGradient, normalizeGradientAngle } from '@/entities/production-graph/model/composition-gradient';
import type { CompositionGradientStop, CompositionLayerStyle } from '@/entities/production-graph/model/types';
import { DarkSelect } from '@/shared/ui/dark-select';
import { normalizeHexColor } from './composition-canvas-geometry';
import { UnitNumberControl } from './composition-inspector-controls';
import type { CompositionLayerControlProps } from './composition-types';

const fillTypeOptions = [
  { label: 'Solid', value: 'solid' },
  { label: 'Linear gradient', value: 'linear' },
];

export function FillControls({ layer, onChange }: CompositionLayerControlProps) {
  const hex = normalizeHexColor(layer.style.color);
  const gradient = layer.style.gradient;
  const fillOpacity = layer.kind === 'rectangle' ? layer.style.fillOpacity : layer.style.opacity;
  const setFillOpacity = (opacity: number) => onChange(layer.kind === 'rectangle' ? { fillOpacity: opacity } : { opacity });
  const updateGradientStop = (index: number, patch: Partial<CompositionGradientStop>) => {
    if (!gradient) return;
    onChange({
      gradient: {
        ...gradient,
        stops: gradient.stops
          .map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop)
          .sort((first, second) => first.offset - second.offset),
      },
    });
  };
  const removeGradientStop = (index: number) => {
    if (!gradient || gradient.stops.length <= 2) return;
    onChange({ gradient: { ...gradient, stops: gradient.stops.filter((_, stopIndex) => stopIndex !== index) } });
  };

  return (
    <section className="composition-inspector-section composition-fill-section">
      <div className="composition-inspector-section-title">
        <strong>Fill</strong>
        {gradient && gradient.stops.length < COMPOSITION_GRADIENT_MAX_STOPS ? (
          <button type="button" className="composition-fill-title-button" aria-label="Add gradient stop" onClick={() => onChange({ gradient: addGradientStop(gradient) })}>
            <Plus size={16} />
          </button>
        ) : null}
      </div>
      <div className="composition-fill-mode-row">
        <DarkSelect
          value={gradient ? 'linear' : 'solid'}
          ariaLabel="Fill type"
          options={fillTypeOptions}
          onChange={(fillType) => onChange({
            gradient: fillType === 'linear' ? createDefaultCompositionGradient(layer.style.color) : undefined,
          })}
          wide
        />
        {gradient ? (
          <UnitNumberControl
            ariaLabel="Gradient angle"
            prefix="Angle"
            suffix="deg"
            value={gradient.angle}
            min={0}
            max={359}
            onChange={(angle) => onChange({ gradient: { ...gradient, angle: normalizeGradientAngle(angle) } })}
          />
        ) : null}
      </div>
      {gradient ? (
        <div className="composition-gradient-stops">
          {gradient.stops.map((stop, index) => (
            <div key={index} className="composition-gradient-stop-row">
              <CompositionColorInput
                ariaLabel={index === 0 ? 'Gradient start color' : index === gradient.stops.length - 1 ? 'Gradient end color' : `Gradient stop ${index + 1} color`}
                color={stop.color}
                onChange={(color) => updateGradientStop(index, { color })}
              />
              <UnitNumberControl
                ariaLabel={`Gradient stop ${index + 1} position`}
                suffix="%"
                value={stop.offset * 100}
                min={0}
                max={100}
                onChange={(offset) => updateGradientStop(index, { offset: offset / 100 })}
              />
              <UnitNumberControl
                ariaLabel={`Gradient stop ${index + 1} opacity`}
                suffix="%"
                value={stop.opacity ?? 100}
                min={0}
                max={100}
                onChange={(opacity) => updateGradientStop(index, { opacity })}
              />
              <button type="button" className="composition-fill-icon-button" aria-label={`Remove gradient stop ${index + 1}`} disabled={gradient.stops.length <= 2} onClick={() => removeGradientStop(index)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <CompositionColorInput ariaLabel="Fill color" color={`#${hex}`} onChange={(color) => onChange({ color } as Partial<CompositionLayerStyle>)} />
      )}
      <div className="composition-fill-footer">
        <UnitNumberControl
          ariaLabel="Fill opacity"
          className="composition-fill-opacity"
          suffix="%"
          value={fillOpacity}
          min={0}
          max={100}
          onChange={setFillOpacity}
        />
        <button type="button" className="composition-fill-icon-button" aria-label="Toggle fill visibility" onClick={() => onChange({ visible: !layer.style.visible })}>
          <Eye size={15} />
        </button>
        <button type="button" className="composition-fill-icon-button" aria-label="Remove fill" onClick={() => setFillOpacity(0)}>
          <Minus size={15} />
        </button>
      </div>
    </section>
  );
}

export function CompositionColorInput({
  ariaLabel,
  color,
  onChange,
}: {
  ariaLabel: string;
  color: string;
  onChange: (color: string) => void;
}) {
  const hex = normalizeHexColor(color);
  return (
    <label className="composition-fill-color">
      <input type="color" aria-label={ariaLabel} value={`#${hex}`} onChange={(event) => onChange(event.target.value)} />
      <span>{hex}</span>
    </label>
  );
}

function addGradientStop(gradient: NonNullable<CompositionLayerStyle['gradient']>) {
  const stops = [...gradient.stops].sort((first, second) => first.offset - second.offset);
  let gapIndex = 0;
  for (let index = 1; index < stops.length - 1; index += 1) {
    if (stops[index + 1].offset - stops[index].offset > stops[gapIndex + 1].offset - stops[gapIndex].offset) gapIndex = index;
  }
  const start = stops[gapIndex];
  const end = stops[gapIndex + 1];
  const next = {
    color: start.color,
    offset: (start.offset + end.offset) / 2,
    opacity: ((start.opacity ?? 100) + (end.opacity ?? 100)) / 2,
  };
  return { ...gradient, stops: [...stops, next].sort((first, second) => first.offset - second.offset) };
}
