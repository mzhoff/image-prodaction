import type { AssetRecord, CompositionLayerGroup, CompositionLayerKind, CompositionLayerStyle, GraphEdge } from '@/entities/production-graph/model/types';


export interface CompositionLayerView {
  asset?: AssetRecord;
  assetId?: string;
  id: string;
  index: number;
  kind: CompositionLayerKind;
  name: string;
  portId: string;
  sourceEdge?: GraphEdge;
  sourceLabel?: string;
  sourceNodeId?: string;
  style: Omit<CompositionLayerStyle, 'id'> & Required<Pick<CompositionLayerStyle, 'align' | 'blendMode' | 'color' | 'fit' | 'flipX' | 'flipY' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'height' | 'letterSpacing' | 'lineHeight' | 'locked' | 'opacity' | 'preserveAspectRatio' | 'rotation' | 'sizingMode' | 'verticalAlign' | 'visible' | 'width' | 'x' | 'y'>>;
  text?: string;
}

export interface CompositionLayerGroupView extends CompositionLayerGroup {
  childGroups: CompositionLayerGroupView[];
  descendantLayerIds: string[];
  layers: CompositionLayerView[];
  parentGroupId?: string;
}

export type CompositionLayerTreeItem =
  | { id: string; kind: 'group'; group: CompositionLayerGroupView }
  | { id: string; kind: 'layer'; layer: CompositionLayerView };

export type CompositionLayerTreeDragItem =
  | { id: string; kind: 'group' }
  | { id: string; kind: 'layer' };

export interface CompositionLayerTreeDropTarget {
  id?: string;
  parentGroupId?: string;
  position: 'after' | 'before' | 'inside';
}

export interface CompositionLayerTreeState {
  locked: boolean;
  visible: boolean;
}
