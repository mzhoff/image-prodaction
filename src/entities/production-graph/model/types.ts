import type { ProductionLayerId } from './production-layers';
import type { ProjectSchemaVersion } from './project-schema';

export type PortKind = 'image' | 'text' | 'preset' | 'reference' | 'video' | 'audio';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type ProductionNodeType =
  | 'importImage'
  | 'textPrompt'
  | 'textConcat'
  | 'textGeneration'
  | 'textSplitter'
  | 'imageToText'
  | 'referenceComposer'
  | 'generateImage'
  | 'sketch'
  | 'cropImage'
  | 'adjustment'
  | 'curves'
  | 'frequencyRetouch'
  | 'refineImage'
  | 'removeBackground'
  | 'exportImage'
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
  message?: string;
  model?: string;
  preset?: ExtractPresetId;
  presets?: ExtractPresetId[];
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

export interface GenerationResultMetadata {
  aspectRatio?: string;
  model?: string;
  size?: string;
}

export interface GenerateImageNodeData extends BaseNodeData {
  model: string;
  aspectRatio: string;
  size: string;
  activeResultIndex?: number;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultMetadata?: Record<string, GenerationResultMetadata>;
  message?: string;
}

export interface TextPromptNodeData extends BaseNodeData {
  text: string;
}

export type TextConcatSeparator = 'newline' | 'double-newline' | 'space' | 'custom';

export interface TextConcatNodeData extends BaseNodeData {
  customSeparator: string;
  inputCount?: number;
  prefix: string;
  result?: string;
  separator: TextConcatSeparator;
  sourceCount?: number;
  suffix: string;
}

export type TextGenerationOutputStyle = 'plain' | 'markdown' | 'numbered-list';
export type TextGenerationReasoning = 'low' | 'medium' | 'high';

export interface TextGenerationNodeData extends BaseNodeData {
  activeResultIndex?: number;
  instruction: string;
  message?: string;
  model: string;
  outputStyle: TextGenerationOutputStyle;
  reasoning?: TextGenerationReasoning;
  result?: string;
  resultTexts?: string[];
  temperature?: number;
}

export type TextSplitterMode = 'newline' | 'paragraph' | 'numbered-list' | 'delimiter';

export interface TextSplitterNodeData extends BaseNodeData {
  activeItemIndex?: number;
  delimiter: string;
  items?: string[];
  message?: string;
  mode: TextSplitterMode;
  result?: string;
  sourceText?: string;
}

export interface SketchNodeData extends BaseNodeData {
  aspectRatio: string;
  assetId?: string;
  brushColor: string;
  brushSize: string;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageNodeData extends BaseNodeData {
  aspectRatio: string;
  crop?: CropRect;
  cropStateVersion?: number;
  locked: boolean;
  resultAssetId?: string;
  message?: string;
  sourceAspectRatio?: number;
  sourceAssetId?: string;
}

export interface RemoveBackgroundNodeData extends BaseNodeData {
  resultAssetId?: string;
  message?: string;
}

export interface AdjustmentNodeData extends BaseNodeData {
  exposure: number;
  gamma: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  resultAssetId?: string;
  message?: string;
  sourceAspectRatio?: number;
  sourceAssetId?: string;
}

export interface CurvesNodeData extends BaseNodeData {
  activeChannel?: 'master' | 'red' | 'green' | 'blue';
  curves?: {
    master?: Array<{ id: string; x: number; y: number }>;
    red?: Array<{ id: string; x: number; y: number }>;
    green?: Array<{ id: string; x: number; y: number }>;
    blue?: Array<{ id: string; x: number; y: number }>;
  };
  maskDataUrl?: string;
  message?: string;
  opacity: number;
  resultAssetId?: string;
  sourceAspectRatio?: number;
  sourceAssetId?: string;
}

export interface FrequencyRetouchNodeData extends BaseNodeData {
  maskDataUrl?: string;
  radius: number;
  rednessReduction: number;
  resultAssetId?: string;
  sourceAspectRatio?: number;
  sourceAssetId?: string;
  message?: string;
  textureAmount: number;
  toneSmoothing: number;
}

export type RefineImageMode = 'reference-cleanup' | 'detail-boost' | 'high-res-redraw';
export type RefinePreserveStrength = 'strict' | 'balanced' | 'creative';

export interface RefineImageNodeData extends BaseNodeData {
  activeResultIndex?: number;
  instruction: string;
  mode: RefineImageMode;
  model: string;
  preserveStrength: RefinePreserveStrength;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultMetadata?: Record<string, GenerationResultMetadata>;
  size: string;
  sourceAspectRatio?: number;
  sourceAssetId?: string;
  message?: string;
}

export interface PreviewNodeData extends BaseNodeData {
  assetId?: string;
}

export type ExportImageFormat = 'png' | 'jpeg' | 'webp';
export type ExportImageScale = '1' | '0.75' | '0.5' | '0.25';
export type ExportImageBackground = 'transparent' | 'white' | 'black';

export interface ExportImageNodeData extends BaseNodeData {
  format: ExportImageFormat;
  quality: string;
  scale: ExportImageScale;
  background: ExportImageBackground;
}

export type ProductionNodeData =
  | ImportImageNodeData
  | ImageToTextNodeData
  | ReferenceComposerNodeData
  | GenerateImageNodeData
  | TextPromptNodeData
  | TextConcatNodeData
  | TextGenerationNodeData
  | TextSplitterNodeData
  | SketchNodeData
  | CropImageNodeData
  | AdjustmentNodeData
  | CurvesNodeData
  | FrequencyRetouchNodeData
  | RefineImageNodeData
  | RemoveBackgroundNodeData
  | ExportImageNodeData
  | PreviewNodeData;

export interface ProductionNode {
  id: string;
  type: ProductionNodeType;
  position: GraphPoint;
  size: GraphSize;
  status: NodeStatus;
  data: ProductionNodeData;
}

export interface GraphSection {
  id: string;
  title: string;
  position: GraphPoint;
  size: GraphSize;
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
  version: ProjectSchemaVersion;
  nodes: ProductionNode[];
  sections: GraphSection[];
  edges: GraphEdge[];
  assets: AssetRecord[];
  presets: PresetRecord[];
  runs: RunRecord[];
  selectedNodeIds: string[];
  selectedSectionIds: string[];
}
