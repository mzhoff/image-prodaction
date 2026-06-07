import type { ProductionLayerId } from './production-layers';
import type { PublicationArtifact, PublicationContentUnitId, PublicationPlatformId } from './publication';
import type { ProjectSchemaVersion } from './project-schema';

export type PortKind = 'image' | 'text' | 'preset' | 'reference' | 'subject' | 'location' | 'publication' | 'video' | 'audio';
export type CollectionItemKind = 'image' | 'text' | 'subject' | 'location' | 'publication';
export type CollectionKind = `${CollectionItemKind}[]`;
export type GraphValueKind = CollectionItemKind | CollectionKind;

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type ProductionNodeType =
  | 'importImage'
  | 'textPrompt'
  | 'textConcat'
  | 'textGeneration'
  | 'textSplitter'
  | 'iterator'
  | 'subjectBuilder'
  | 'locationBuilder'
  | 'telegramPublication'
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
  disabledLayerIds?: ProductionLayerId[];
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

export type TextPromptVariableDisplayMode = 'source-value' | 'value' | 'source';

export interface TextPromptVariable {
  id: string;
  alias: string;
}

export interface TextPromptNodeData extends BaseNodeData {
  result?: string;
  sourceCount?: number;
  text: string;
  textareaHeight?: number;
  variableDisplayMode?: TextPromptVariableDisplayMode;
  variables?: TextPromptVariable[];
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
  disabledResultFilterIds?: string[];
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

export type IteratorActiveKind = 'image' | 'text';

export interface IteratorNodeData extends BaseNodeData {
  activeImageAssetId?: string;
  activeIndex: number;
  activeKind: IteratorActiveKind;
  activeText?: string;
  imageCount?: number;
  message?: string;
  textCount?: number;
}

export type SubjectType = 'person' | 'character' | 'product' | 'object' | 'vehicle' | 'animal' | 'place';
export type SubjectPreserveStrength = 'strict' | 'balanced' | 'flexible';

export interface SubjectBuilderNodeData extends BaseNodeData {
  identitySummary: string;
  immutableTraits: string;
  libraryImageAssetIds?: string[];
  librarySubjectId?: string;
  libraryUpdatedAt?: string;
  message?: string;
  mutableAttributes: string;
  name: string;
  negativeConstraints: string;
  notes: string;
  preserveStrength: SubjectPreserveStrength;
  referenceModel?: string;
  result?: string;
  sourceCount?: number;
  subjectType: SubjectType;
}

export interface SubjectRecord {
  id: string;
  createdAt: string;
  identitySummary: string;
  imageAssetIds: string[];
  immutableTraits: string;
  mutableAttributes: string;
  name: string;
  negativeConstraints: string;
  notes: string;
  passportText: string;
  preserveStrength: SubjectPreserveStrength;
  sourceNodeId?: string;
  subjectType: SubjectType;
  title: string;
  updatedAt: string;
}

export type LocationType = 'interior' | 'exterior' | 'urban' | 'nature' | 'studio' | 'abstract';
export type LocationPreserveStrength = 'strict' | 'balanced' | 'flexible';

export interface LocationBuilderNodeData extends BaseNodeData {
  atmosphere: string;
  description: string;
  libraryImageAssetIds?: string[];
  libraryLocationId?: string;
  libraryUpdatedAt?: string;
  locationType: LocationType;
  message?: string;
  mutableAttributes: string;
  name: string;
  negativeConstraints: string;
  notes: string;
  preserveStrength: LocationPreserveStrength;
  result?: string;
  sourceCount?: number;
  spatialLayout: string;
}

export interface LocationRecord {
  id: string;
  atmosphere: string;
  createdAt: string;
  description: string;
  imageAssetIds: string[];
  locationType: LocationType;
  mutableAttributes: string;
  name: string;
  negativeConstraints: string;
  notes: string;
  passportText: string;
  preserveStrength: LocationPreserveStrength;
  sourceNodeId?: string;
  spatialLayout: string;
  title: string;
  updatedAt: string;
}

export interface TelegramPublicationNodeData extends BaseNodeData {
  artifactId?: string;
  contentUnitId: PublicationContentUnitId;
  body?: string;
  caption?: string;
  cta?: string;
  mediaInputCount?: number;
  mediaOrder: string[];
  message?: string;
  messageRichText?: string;
  messageRichTextSource?: string;
  messageSourceText?: string;
  messageText: string;
  platformId: PublicationPlatformId;
  publicationTitle?: string;
  result?: string;
  sourceImageCount?: number;
  sourceTextCount?: number;
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
  | IteratorNodeData
  | SubjectBuilderNodeData
  | LocationBuilderNodeData
  | TelegramPublicationNodeData
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
  locked?: boolean;
  data: ProductionNodeData;
}

export interface GraphSection {
  id: string;
  title: string;
  parentId?: string;
  position: GraphPoint;
  size: GraphSize;
  color?: string;
  locked?: boolean;
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
  subjects: SubjectRecord[];
  locations: LocationRecord[];
  publications: PublicationArtifact[];
  runs: RunRecord[];
  selectedNodeIds: string[];
  selectedSectionIds: string[];
}
