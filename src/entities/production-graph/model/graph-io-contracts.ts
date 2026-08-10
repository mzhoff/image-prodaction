import type { AssetRecord, GraphEdge, GraphValueKind, ProductionNode } from './types';

export interface GraphIoContext {
  edges: GraphEdge[];
  nodes: ProductionNode[];
  assets: AssetRecord[];
}

export interface GraphIncomingSource {
  edge: GraphEdge;
  sourceNode: ProductionNode;
  sourcePortId: string;
  targetPortId: string;
}

export interface GraphImageInputItem extends GraphIncomingSource {
  asset: AssetRecord;
  assetId: string;
  collectionIndex?: number;
  sourceLabel?: string;
  sourceCollectionSize?: number;
  valueKind?: GraphValueKind;
  filename?: string;
}

export interface GraphTextInputItem extends GraphIncomingSource {
  collectionIndex?: number;
  richText?: string;
  sourceCollectionSize?: number;
  text: string;
  sourceLabel?: string;
  valueKind?: GraphValueKind;
}

export interface GraphObjectInputItem extends GraphIncomingSource {
  objectKind: 'subject' | 'location';
  sourceLabel?: string;
  text: string;
  valueKind?: GraphValueKind;
}

export type RoutedDataKind =
  | 'audio' | 'image' | 'location' | 'publication' | 'subject'
  | 'text' | 'video' | 'empty';
