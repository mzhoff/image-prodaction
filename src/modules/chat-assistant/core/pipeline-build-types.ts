import type {
  AssetRecord,
  GraphEdge,
  ProductionNode,
  ProductionNodeType,
} from '@/entities/production-graph/model/types';

export interface PreparedPipelineBuildPatch {
  assets?: AssetRecord[];
  attachmentImports: Array<{
    attachmentId?: string;
    attachmentIndex: number;
    attachmentName?: string;
    nodeId: string;
  }>;
  documentName: string;
  edges: GraphEdge[];
  nodes: ProductionNode[];
  summary: string;
  version: 2;
}

export interface PipelineBuildSafePreview extends Record<string, unknown> {
  action: 'build-pipeline';
  addedEdgeCount: number;
  addedNodeCount: number;
  documentName: string;
  layout: 'horizontal' | 'vertical';
  nodes: Array<{
    key: string;
    position: { x: number; y: number };
    settings: Record<string, string | number>;
    sourceAttachmentIndex?: number;
    sourceAttachmentName?: string;
    title: string;
    type: ProductionNodeType;
  }>;
  summary: string;
  warnings: string[];
}
