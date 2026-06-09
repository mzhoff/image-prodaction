import type { PublicationArtifact } from './publication';
import type { ProjectSchemaVersion } from './project-schema';
import type { GraphEdge, GraphPoint, GraphSection, GraphSize, NodeStatus, ProductionNodeType } from './graph-core-types';
import type { LocationRecord, PresetRole, ProductionNodeData, SubjectRecord } from './node-data-types';

export interface ProductionNode {
  id: string;
  type: ProductionNodeType;
  position: GraphPoint;
  size: GraphSize;
  status: NodeStatus;
  locked?: boolean;
  data: ProductionNodeData;
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
