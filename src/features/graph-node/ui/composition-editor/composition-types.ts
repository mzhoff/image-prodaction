import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import type { useCompositionNodeModel, CompositionLayerView } from '../../model/use-composition-node-model';

export type CompositionModel = ReturnType<typeof useCompositionNodeModel>;
export type CompositionLayerPatch = { layerId: string; patch: Partial<CompositionLayerStyle> };
export type CompositionEditorTool = 'select' | 'hand' | 'shape' | 'text';
export type CompositionShapeTool = 'rectangle' | 'ellipse' | 'triangle' | 'star';
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface LayerBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CompositionLayerControlProps {
  layer: CompositionLayerView;
  onChange: (patch: Partial<CompositionLayerStyle>) => void;
}
