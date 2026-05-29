import type { AssetRecord, GraphEdge, GraphPoint, GraphProject, ProductionNode, ProductionNodeData, ProductionNodeType, RunRecord } from './types';

export type GraphSnapshot = Pick<GraphProject, 'nodes' | 'edges' | 'assets' | 'presets' | 'runs' | 'selectedNodeIds'>;
export type ConnectResult = { ok: true } | { ok: false; reason: string };

export interface ProductionGraphState extends GraphProject {
  historyPast: GraphSnapshot[];
  historyFuture: GraphSnapshot[];
  addNode: (type: ProductionNodeType, position: GraphPoint) => string;
  addAsset: (asset: AssetRecord) => void;
  assignAssetToNode: (nodeId: string, assetId: string) => void;
  pasteImageAsset: (asset: AssetRecord, position: GraphPoint, targetNodeId?: string) => void;
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ConnectResult;
  deleteSelected: () => void;
  deleteEdge: (edgeId: string) => void;
  moveNode: (nodeId: string, position: GraphPoint) => void;
  moveSelectedNodesBy: (delta: GraphPoint) => void;
  pasteNodes: (nodes: ProductionNode[], edges: GraphEdge[], position: GraphPoint) => void;
  resetProject: () => void;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectNodesInRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  setNodeStatus: (nodeId: string, status: ProductionNode['status']) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  updateNodeData: (nodeId: string, data: Partial<ProductionNodeData>) => void;
  updateNodePrompt: (nodeId: string, prompt: string) => void;
  updateNodeResult: (nodeId: string, result: string) => void;
  updateTextPrompt: (nodeId: string, text: string) => void;
  upsertRun: (run: RunRecord) => void;
}
