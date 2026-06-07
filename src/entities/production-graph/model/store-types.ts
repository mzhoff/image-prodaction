import type { AssetRecord, GraphEdge, GraphPoint, GraphProject, LocationRecord, ProductionNode, ProductionNodeData, ProductionNodeType, RunRecord, SubjectRecord } from './types';
import type { PipelineTemplateExport, PortableProjectExport, ProjectExport, ProjectNodeUiState, ProjectSectionUiState, ProjectUiState, ProjectViewportState } from './project-schema';

export type GraphSnapshot = Pick<GraphProject, 'nodes' | 'sections' | 'edges' | 'assets' | 'presets' | 'subjects' | 'locations' | 'publications' | 'runs' | 'selectedNodeIds' | 'selectedSectionIds'>;
export type ConnectResult = { ok: true } | { ok: false; reason: string };
export interface ConnectOptions {
  detachedEdge?: GraphEdge;
}
export interface DeleteEdgeOptions {
  preserveDynamicInputSlots?: boolean;
  preserveTextConcatSlots?: boolean;
}

export interface ProductionGraphState extends GraphProject {
  historyPast: GraphSnapshot[];
  historyFuture: GraphSnapshot[];
  uiState: ProjectUiState;
  addSection: (rect: { x: number; y: number; width: number; height: number }) => string;
  addNode: (type: ProductionNodeType, position: GraphPoint) => string;
  addAsset: (asset: AssetRecord) => void;
  assignAssetToNode: (nodeId: string, assetId: string) => void;
  clearNodeGenerations: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  pasteImageAsset: (asset: AssetRecord, position: GraphPoint, targetNodeId?: string) => void;
  renameNode: (nodeId: string, title: string) => void;
  toggleNodeLock: (nodeId: string) => void;
  compactDynamicInputSlots: (nodeId: string) => void;
  compactTextConcatInputs: (nodeId: string) => void;
  reorderTelegramMediaInputs: (nodeId: string, edgeIds: string[], mediaOrder: string[]) => void;
  applyLocationToNode: (nodeId: string, locationId: string) => { ok: true } | { ok: false; reason: string };
  applySubjectToNode: (nodeId: string, subjectId: string) => { ok: true } | { ok: false; reason: string };
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectOptions) => ConnectResult;
  deleteSelected: () => void;
  deleteEdge: (edgeId: string, options?: DeleteEdgeOptions) => void;
  moveNode: (nodeId: string, position: GraphPoint) => void;
  moveSelectedNodesBy: (delta: GraphPoint) => void;
  pasteNodes: (nodes: ProductionNode[], edges: GraphEdge[], position: GraphPoint) => void;
  publishLocationFromNode: (nodeId: string) => { ok: true; location: LocationRecord } | { ok: false; reason: string };
  publishSubjectFromNode: (nodeId: string) => { ok: true; subject: SubjectRecord } | { ok: false; reason: string };
  resetProject: () => void;
  deleteSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => void;
  moveSectionBy: (sectionId: string, delta: GraphPoint, nodeIds?: string[]) => void;
  renameSection: (sectionId: string, title: string) => void;
  resizeSection: (sectionId: string, rect: { x: number; y: number; width: number; height: number }) => void;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectNodesInRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  selectSection: (sectionId: string, additive?: boolean) => void;
  setSectionColor: (sectionId: string, color: string) => void;
  toggleSectionLock: (sectionId: string) => void;
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
  exportProjectSnapshot: () => ProjectExport;
  exportPipelineTemplate: () => PipelineTemplateExport;
  importPortableProject: (payload: unknown, expectedKind?: PortableProjectExport['kind']) => { kind: ProjectExport['kind'] | PipelineTemplateExport['kind'] };
}
