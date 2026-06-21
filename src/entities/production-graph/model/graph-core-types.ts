export type PortKind = 'any' | 'image' | 'text' | 'preset' | 'reference' | 'subject' | 'location' | 'publication' | 'video' | 'audio';
export type CollectionItemKind = 'image' | 'text' | 'subject' | 'location' | 'publication';
export type CollectionKind = `${CollectionItemKind}[]`;
export type GraphValueKind = CollectionItemKind | CollectionKind;

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type ProductionNodeType =
  | 'importImage'
  | 'textPrompt'
  | 'textConcat'
  | 'textGeneration'
  | 'textToSpeech'
  | 'textFormatter'
  | 'textSplitter'
  | 'iterator'
  | 'router'
  | 'subjectBuilder'
  | 'locationBuilder'
  | 'telegramPublication'
  | 'imageToText'
  | 'referenceComposer'
  | 'composition'
  | 'generateImage'
  | 'sketch'
  | 'cropImage'
  | 'adjustment'
  | 'curves'
  | 'frequencyRetouch'
  | 'refineImage'
  | 'removeBackground'
  | 'exportImage'
  | 'banner'
  | 'preview';

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
