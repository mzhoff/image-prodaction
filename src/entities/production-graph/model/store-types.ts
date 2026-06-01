import type { AssetRecord, GraphEdge, GraphPoint, GraphProject, ProductionNode, ProductionNodeData, ProductionNodeType, RunRecord } from './types';
import type { ProjectNodeUiState, ProjectSectionUiState, ProjectUiState, ProjectViewportState } from './project-schema';

export type GraphSnapshot = Pick<GraphProject, 'nodes' | 'sections' | 'edges' | 'assets' | 'presets' | 'runs' | 'selectedNodeIds' | 'selectedSectionIds'>;
export type ConnectResult = { ok: true } | { ok: false; reason: string };

export interface ProductionGraphState extends GraphProject {
  historyPast: GraphSnapshot[];
  historyFuture: GraphSnapshot[];
  uiState: ProjectUiState;
  addSection: (rect: { x: number; y: number; width: number; height: number }) => string;
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
  moveSectionBy: (sectionId: string, delta: GraphPoint, nodeIds?: string[]) => void;
  renameSection: (sectionId: string, title: string) => void;
  resizeSection: (sectionId: string, rect: { x: number; y: number; width: number; height: number }) => void;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectNodesInRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  selectSection: (sectionId: string, additive?: boolean) => void;
  setNodeStatus: (nodeId: string, status: ProductionNode['status']) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  updateNodeData: (nodeId: string, data: Partial<ProductionNodeData>) => void;
  updateNodeDataSilent: (nodeId: string, data: Partial<ProductionNodeData>) => void;
  updateNodePrompt: (nodeId: string, prompt: string) => void;
  updateNodeResult: (nodeId: string, result: string) => void;
  updateTextPrompt: (nodeId: string, text: string) => void;
  upsertRun: (run: RunRecord) => void;
  setProjectUiViewport: (viewport: ProjectViewportState) => void;
  setNodeUiState: (nodeId: string, nodeUiState: Partial<ProjectNodeUiState>) => void;
  setSectionUiState: (sectionId: string, sectionUiState: Partial<ProjectSectionUiState>) => void;
}
