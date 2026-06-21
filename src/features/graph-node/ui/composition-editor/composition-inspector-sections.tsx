'use client';

import { AlignCenter, AlignCenterVertical, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Baseline, Blend, Circle, Droplet, Eye, FlipHorizontal, FlipVertical, Link2, MoveHorizontal, MoveVertical, RotateCw, Square } from 'lucide-react';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import { DarkSelect } from '@/shared/ui/dark-select';
import { compositionBlendModeOptions, compositionFontOptions, compositionWeightOptions, getDefaultTextLineHeight, type CompositionLayerView } from '../../model/use-composition-node-model';
import type { CompositionAlignment } from '../../model/use-composition-node-model';
import { getAutoLayerHeight, getAutoLayerWidth, normalizeRotation } from './composition-canvas-geometry';
import { LetterSpacingMark, SegmentedIconControl, UnitNumberControl } from './composition-inspector-controls';

export function PositionControls({
  layer,
  onAlignCanvas,
  onChange,
}: {
  layer: CompositionLayerView;
  onAlignCanvas: (alignment: CompositionAlignment) => void;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}) {
  return (
    <section className="composition-inspector-section composition-position-section">
      <div className="composition-inspector-section-title">
        <strong>Position</strong>
      </div>
      <div className="composition-compact-grid">
        <SegmentedIconControl
          value=""
          options={[
            { icon: <AlignLeft size={15} />, label: 'Align left', value: 'left' },
            { icon: <AlignCenter size={15} />, label: 'Align center horizontally', value: 'center-x' },
            { icon: <AlignRight size={15} />, label: 'Align right', value: 'right' },
          ]}
          onChange={(alignment) => onAlignCanvas(alignment as CompositionAlignment)}
        />
        <SegmentedIconControl
          value=""
          options={[
            { icon: <ArrowUpToLine size={15} />, label: 'Align top', value: 'top' },
            { icon: <AlignCenterVertical size={15} />, label: 'Align center vertically', value: 'center-y' },
            { icon: <ArrowDownToLine size={15} />, label: 'Align bottom', value: 'bottom' },
          ]}
          onChange={(alignment) => onAlignCanvas(alignment as CompositionAlignment)}
        />
      </div>
      <div className="composition-compact-grid">
        <UnitNumberControl ariaLabel="X coordinate" prefix="X" value={layer.style.x} onChange={(x) => onChange({ x })} />
        <UnitNumberControl ariaLabel="Y coordinate" prefix="Y" value={layer.style.y} onChange={(y) => onChange({ y })} />
      </div>
      <div className="composition-compact-grid">
        <UnitNumberControl
          ariaLabel="Rotation angle"
          icon={<RotateCw size={14} />}
          suffix="deg"
          value={layer.style.rotation}
          min={-360}
          max={360}
          onChange={(rotation) => onChange({ rotation })}
        />
        <SegmentedIconControl
          value=""
          options={[
            { icon: <RotateCw size={15} />, label: 'Rotate 90 degrees', value: 'rotate-90' },
            { icon: <FlipHorizontal size={15} />, label: 'Flip horizontal', value: 'flip-x' },
            { icon: <FlipVertical size={15} />, label: 'Flip vertical', value: 'flip-y' },
          ]}
          onChange={(action) => {
            if (action === 'rotate-90') onChange({ rotation: normalizeRotation(layer.style.rotation + 90) });
            if (action === 'flip-x') onChange({ flipX: !layer.style.flipX });
            if (action === 'flip-y') onChange({ flipY: !layer.style.flipY });
          }}
        />
      </div>
    </section>
  );
}

export function LayoutControls({
  canvasHeight,
  canvasWidth,
  layer,
  onChange,
}: {
  canvasHeight: number;
  canvasWidth: number;
  layer: CompositionLayerView;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}) {
  const ratio = layer.style.width / Math.max(1, layer.style.height);
  const setWidth = (width: number) => onChange({
    width,
    ...(layer.style.preserveAspectRatio ? { height: Math.max(24, Math.round(width / Math.max(0.01, ratio))) } : {}),
    sizingMode: 'fixed',
  });
  const setHeight = (height: number) => onChange({
    height,
    ...(layer.style.preserveAspectRatio ? { width: Math.max(24, Math.round(height * ratio)) } : {}),
    sizingMode: 'fixed',
  });
  const applySizingMode = (sizingMode: string) => {
    if (sizingMode === 'auto-width') {
      onChange({
        sizingMode: 'auto-width',
        width: getAutoLayerWidth(layer, canvasWidth),
      });
      return;
    }
    if (sizingMode === 'auto-height') {
      onChange({
        height: getAutoLayerHeight(layer, canvasHeight),
        sizingMode: 'auto-height',
      });
      return;
    }
    onChange({ sizingMode: 'fixed' });
  };

  return (
    <section className="composition-inspector-section composition-layout-section">
      <div className="composition-inspector-section-title">
        <strong>Layout</strong>
      </div>
      <SegmentedIconControl
        value={layer.style.sizingMode}
        options={[
          { icon: <MoveHorizontal size={15} />, label: 'Auto width', value: 'auto-width' },
          { icon: <MoveVertical size={15} />, label: 'Auto height', value: 'auto-height' },
          { icon: <Square size={14} />, label: 'Fixed size', value: 'fixed' },
        ]}
        onChange={applySizingMode}
      />
      <div className="composition-layout-size-row">
        <UnitNumberControl ariaLabel="Layer width" prefix="W" value={layer.style.width} min={1} max={4096} onChange={setWidth} />
        <UnitNumberControl ariaLabel="Layer height" prefix="H" value={layer.style.height} min={1} max={4096} onChange={setHeight} />
        <button
          type="button"
          className={layer.style.preserveAspectRatio ? 'composition-square-icon-button composition-square-icon-button-active' : 'composition-square-icon-button'}
          aria-label={layer.style.preserveAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          onClick={() => onChange({ preserveAspectRatio: !layer.style.preserveAspectRatio })}
        >
          <Link2 size={15} />
        </button>
      </div>
    </section>
  );
}

export function OpacityControls({
  layer,
  onChange,
}: {
  layer: CompositionLayerView;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}) {
  return (
    <section className="composition-inspector-section composition-opacity-section">
      <div className="composition-inspector-section-title">
        <strong>Opacity</strong>
        <span className="composition-opacity-title-actions" aria-hidden="true">
          <Eye size={15} />
          <Droplet size={15} />
        </span>
      </div>
      <div className="composition-opacity-row">
        <UnitNumberControl
          ariaLabel="Layer opacity"
          icon={<Blend size={14} />}
          suffix="%"
          value={layer.style.opacity}
          min={0}
          max={100}
          onChange={(opacity) => onChange({ opacity })}
        />
        <DarkSelect
          value={layer.style.blendMode}
          options={compositionBlendModeOptions}
          onChange={(blendMode) => onChange({ blendMode: blendMode as CompositionLayerStyle['blendMode'] })}
          wide
        />
      </div>
    </section>
  );
}

export function TypographyControls({
  layer,
  onChange,
}: {
  layer: CompositionLayerView;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}) {
  const isAutoLineHeight = layer.style.lineHeight === getDefaultTextLineHeight(layer.style.fontSize);

  return (
    <section className="composition-inspector-section composition-typography-section">
      <div className="composition-inspector-section-title">
        <strong>Typography</strong>
        <span aria-hidden="true" className="composition-inspector-drag-icon">
          <Circle size={4} />
          <Circle size={4} />
          <Circle size={4} />
          <Circle size={4} />
        </span>
      </div>
      <div className="composition-typography-grid composition-typography-grid-font">
        <DarkSelect value={layer.style.fontFamily} options={compositionFontOptions} onChange={(fontFamily) => onChange({ fontFamily })} wide />
        <DarkSelect value={layer.style.fontWeight} options={compositionWeightOptions} onChange={(fontWeight) => onChange({ fontWeight: fontWeight as CompositionLayerStyle['fontWeight'] })} wide />
        <UnitNumberControl
          ariaLabel="Font size"
          value={layer.style.fontSize}
          min={8}
          max={240}
          onChange={(fontSize) => onChange({
            fontSize,
            lineHeight: isAutoLineHeight ? getDefaultTextLineHeight(fontSize) : layer.style.lineHeight,
          })}
        />
      </div>
      <div className="composition-typography-grid">
        <button
          type="button"
          className="composition-typography-button composition-typography-button-wide"
          onClick={() => onChange({ lineHeight: getDefaultTextLineHeight(layer.style.fontSize) })}
        >
          <Baseline size={14} />
          <span>{isAutoLineHeight ? 'Auto' : Math.round(layer.style.lineHeight)}</span>
        </button>
        <UnitNumberControl
          ariaLabel="Letter spacing"
          icon={<LetterSpacingMark />}
          suffix="%"
          value={layer.style.letterSpacing}
          min={-100}
          max={500}
          onChange={(letterSpacing) => onChange({ letterSpacing })}
        />
      </div>
      <div className="composition-typography-grid">
        <SegmentedIconControl
          value={layer.style.align}
          options={[
            { icon: <AlignLeft size={15} />, label: 'Align left', value: 'left' },
            { icon: <AlignCenter size={15} />, label: 'Align center', value: 'center' },
            { icon: <AlignRight size={15} />, label: 'Align right', value: 'right' },
          ]}
          onChange={(align) => onChange({ align: align as CompositionLayerStyle['align'] })}
        />
        <SegmentedIconControl
          value={layer.style.verticalAlign}
          options={[
            { icon: <ArrowUpToLine size={15} />, label: 'Align top', value: 'top' },
            { icon: <AlignCenterVertical size={15} />, label: 'Align middle', value: 'center' },
            { icon: <ArrowDownToLine size={15} />, label: 'Align bottom', value: 'bottom' },
          ]}
          onChange={(verticalAlign) => onChange({ verticalAlign: verticalAlign as CompositionLayerStyle['verticalAlign'] })}
        />
      </div>
    </section>
  );
}
