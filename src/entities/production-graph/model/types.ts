import type { ProductionLayerId } from './production-layers';

export type PortKind = 'image' | 'text' | 'preset' | 'reference' | 'video' | 'audio';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type ProductionNodeType =
  | 'importImage'
  | 'textPrompt'
  | 'imageToText'
  | 'referenceComposer'
  | 'generateImage'
  | 'preview';

export type PresetRole = ProductionLayerId;

export type ExtractPresetId = 'default' | ProductionLayerId;

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphSize {
  width: number;
  height: number;
}

export interface GraphPort {
  id: string;
  label: string;
  kind: PortKind;
  side: 'input' | 'output';
}

export interface BaseNodeData {
  title: string;
  prompt?: string;
}

export interface ImportImageNodeData extends BaseNodeData {
  assetId?: string;
}

export interface ImageToTextNodeData extends BaseNodeData {
  model?: string;
  preset?: ExtractPresetId;
  result?: string;
}

export interface ReferenceComposerNodeData extends BaseNodeData {
  model?: string;
  site?: string;
  aspectRatio?: string;
  size?: string;
  slots: Array<{
    id: PresetRole;
    label: string;
    value?: string;
  }>;
  composedPrompt?: string;
}

export interface GenerateImageNodeData extends BaseNodeData {
  model: string;
  aspectRatio: string;
  size: string;
  resultAssetId?: string;
  message?: string;
}

export interface TextPromptNodeData extends BaseNodeData {
  text: string;
}

export interface PreviewNodeData extends BaseNodeData {
  assetId?: string;
}

export type ProductionNodeData =
  | ImportImageNodeData
  | ImageToTextNodeData
  | ReferenceComposerNodeData
  | GenerateImageNodeData
  | TextPromptNodeData
  | PreviewNodeData;

export interface ProductionNode {
  id: string;
  type: ProductionNodeType;
  position: GraphPoint;
  size: GraphSize;
  status: NodeStatus;
  data: ProductionNodeData;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface AssetRecord {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
  storage: {
    type: 'indexeddb';
    blobKey: string;
  };
}

export interface PresetRecord {
  id: string;
  role: PresetRole;
  title: string;
  text: string;
  sourceAssetId?: string;
}

export interface RunRecord {
  id: string;
  nodeId: string;
  status: NodeStatus;
  createdAt: string;
  message?: string;
}

export interface GraphProject {
  version: 1;
  nodes: ProductionNode[];
  edges: GraphEdge[];
  assets: AssetRecord[];
  presets: PresetRecord[];
  runs: RunRecord[];
  selectedNodeIds: string[];
}
