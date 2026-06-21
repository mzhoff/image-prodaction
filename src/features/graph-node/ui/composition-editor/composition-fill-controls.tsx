'use client';

import { Circle, Eye, Minus, Plus } from 'lucide-react';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import { normalizeHexColor } from './composition-canvas-geometry';
import { UnitNumberControl } from './composition-inspector-controls';
import type { CompositionLayerControlProps } from './composition-types';

export function FillControls({ layer, onChange }: CompositionLayerControlProps) {
  const hex = normalizeHexColor(layer.style.color);

  return (
    <section className="composition-inspector-section composition-fill-section">
      <div className="composition-inspector-section-title">
        <strong>Fill</strong>
        <span className="composition-fill-title-actions" aria-hidden="true">
          <Circle size={4} />
          <Circle size={4} />
          <Circle size={4} />
          <Circle size={4} />
          <Plus size={16} />
        </span>
      </div>
      <div className="composition-fill-row">
        <label className="composition-fill-color">
          <input type="color" value={`#${hex}`} onChange={(event) => onChange({ color: event.target.value } as Partial<CompositionLayerStyle>)} />
          <span>{hex}</span>
        </label>
        <UnitNumberControl
          ariaLabel="Fill opacity"
          className="composition-fill-opacity"
          suffix="%"
          value={layer.style.opacity}
          min={0}
          max={100}
          onChange={(opacity) => onChange({ opacity })}
        />
        <button type="button" className="composition-fill-icon-button" aria-label="Toggle fill visibility" onClick={() => onChange({ visible: !layer.style.visible })}>
          <Eye size={15} />
        </button>
        <button type="button" className="composition-fill-icon-button" aria-label="Remove fill" onClick={() => onChange({ opacity: 0 })}>
          <Minus size={15} />
        </button>
      </div>
    </section>
  );
}
