'use client';

import { Plus, Trash2 } from 'lucide-react';
import { DEFAULT_COMPOSITION_SHADOW } from '@/entities/production-graph/model/composition-shape';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import { CompositionColorInput } from './composition-fill-controls';
import { UnitNumberControl } from './composition-inspector-controls';
import type { CompositionLayerControlProps } from './composition-types';

export function CompositionShapeEffectsControls({ layer, onChange }: CompositionLayerControlProps) {
  const shadow = layer.style.shadow;
  const updateShadow = (patch: Partial<NonNullable<CompositionLayerStyle['shadow']>>) => {
    onChange({ shadow: { ...(shadow ?? DEFAULT_COMPOSITION_SHADOW), ...patch } });
  };

  return (
    <section className="composition-inspector-section composition-shape-effects-section">
      <div className="composition-inspector-section-title">
        <strong>Effects</strong>
      </div>
      <div className="composition-shape-effects-grid">
        <UnitNumberControl
          ariaLabel="Corner radius"
          prefix="Radius"
          value={layer.style.cornerRadius}
          min={0}
          max={2048}
          onChange={(cornerRadius) => onChange({ cornerRadius })}
        />
        <UnitNumberControl
          ariaLabel="Layer blur"
          prefix="Blur"
          value={layer.style.blur}
          min={0}
          max={500}
          onChange={(blur) => onChange({ blur })}
        />
      </div>
      {shadow ? (
        <div className="composition-shadow-controls">
          <div className="composition-shadow-header">
            <span>Drop shadow</span>
            <button type="button" className="composition-fill-icon-button" aria-label="Remove shadow" onClick={() => onChange({ shadow: undefined })}>
              <Trash2 size={14} />
            </button>
          </div>
          <CompositionColorInput ariaLabel="Shadow color" color={shadow.color} onChange={(color) => updateShadow({ color })} />
          <div className="composition-shape-effects-grid">
            <UnitNumberControl ariaLabel="Shadow X" prefix="X" value={shadow.offsetX} min={-4096} max={4096} onChange={(offsetX) => updateShadow({ offsetX })} />
            <UnitNumberControl ariaLabel="Shadow Y" prefix="Y" value={shadow.offsetY} min={-4096} max={4096} onChange={(offsetY) => updateShadow({ offsetY })} />
            <UnitNumberControl ariaLabel="Shadow blur" prefix="Blur" value={shadow.blur} min={0} max={500} onChange={(blur) => updateShadow({ blur })} />
            <UnitNumberControl ariaLabel="Shadow opacity" suffix="%" value={shadow.opacity} min={0} max={100} onChange={(opacity) => updateShadow({ opacity })} />
          </div>
        </div>
      ) : (
        <button type="button" className="composition-add-effect-button" onClick={() => onChange({ shadow: DEFAULT_COMPOSITION_SHADOW })}>
          <Plus size={14} />
          <span>Add drop shadow</span>
        </button>
      )}
    </section>
  );
}
