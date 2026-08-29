'use client';

import { useEffect, useState } from 'react';
import {
  COMPOSITION_CANVAS_DIMENSION_MAX,
  COMPOSITION_CANVAS_DIMENSION_MIN,
  compositionCanvasPresetGroups,
  compositionCanvasPresets,
  getCompositionCanvasPresetId,
  normalizeCompositionCanvasDimension,
} from '../../model/composition-canvas-presets';

export function CanvasSizeControls({
  height,
  onPresetChange,
  onSizeChange,
  width,
}: {
  height: number;
  onPresetChange: (presetId: string) => void;
  onSizeChange: (width: number, height: number) => void;
  width: number;
}) {
  const selectedPresetId = getCompositionCanvasPresetId(width, height);

  return (
    <section className="composition-inspector-section composition-canvas-size-section">
      <div className="composition-inspector-section-title">
        <strong>Canvas</strong>
      </div>
      <select
        className="composition-canvas-preset-control"
        aria-label="Canvas format preset"
        value={selectedPresetId}
        onChange={(event) => onPresetChange(event.target.value)}
      >
        <option value="custom">Custom size</option>
        {compositionCanvasPresetGroups.map((group) => (
          <optgroup key={group} label={group}>
            {compositionCanvasPresets.filter((preset) => preset.group === group).map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="composition-compact-grid">
        <CanvasDimensionInput label="Canvas width" prefix="W" value={width} onCommit={(nextWidth) => onSizeChange(nextWidth, height)} />
        <CanvasDimensionInput label="Canvas height" prefix="H" value={height} onCommit={(nextHeight) => onSizeChange(width, nextHeight)} />
      </div>
    </section>
  );
}

function CanvasDimensionInput({
  label,
  onCommit,
  prefix,
  value,
}: {
  label: string;
  onCommit: (value: number) => void;
  prefix: string;
  value: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (rawValue: string) => {
    if (!rawValue.trim()) {
      setDraft(String(value));
      return;
    }
    const nextValue = normalizeCompositionCanvasDimension(Number(rawValue), value);
    setDraft(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  };

  return (
    <label className="composition-unit-number-control">
      <span className="composition-unit-number-prefix">{prefix}</span>
      <input
        type="number"
        aria-label={label}
        value={draft}
        min={COMPOSITION_CANVAS_DIMENSION_MIN}
        max={COMPOSITION_CANVAS_DIMENSION_MAX}
        onBlur={(event) => commit(event.currentTarget.value)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.currentTarget.value = String(value);
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
