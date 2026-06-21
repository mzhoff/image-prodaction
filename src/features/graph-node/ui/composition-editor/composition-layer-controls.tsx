'use client';

import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import { DarkSelect } from '@/shared/ui/dark-select';
import { compositionFitOptions, type CompositionLayerView } from '../../model/use-composition-node-model';
import type { CompositionAlignment } from '../../model/use-composition-node-model';
import { FillControls } from './composition-fill-controls';
import { LayoutControls, OpacityControls, PositionControls, TypographyControls } from './composition-inspector-sections';

export function CompositionLayerControls({
  canvasHeight,
  canvasWidth,
  layer,
  onAlignCanvas,
  onChange,
}: {
  canvasHeight: number;
  canvasWidth: number;
  layer: CompositionLayerView;
  onAlignCanvas: (alignment: CompositionAlignment) => void;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}) {
  return (
    <div className="composition-layer-controls">
      <PositionControls
        layer={layer}
        onAlignCanvas={onAlignCanvas}
        onChange={onChange}
      />
      <LayoutControls
        canvasHeight={canvasHeight}
        canvasWidth={canvasWidth}
        layer={layer}
        onChange={onChange}
      />
      <OpacityControls layer={layer} onChange={onChange} />
      {layer.kind === 'image' ? (
        <label className="composition-control-row">
          <span>Scale</span>
          <DarkSelect value={layer.style.fit} options={compositionFitOptions} onChange={(fit) => onChange({ fit: fit as CompositionLayerStyle['fit'] })} wide />
        </label>
      ) : (
        <>
          <TypographyControls layer={layer} onChange={onChange} />
          <FillControls layer={layer} onChange={onChange} />
        </>
      )}
    </div>
  );
}
