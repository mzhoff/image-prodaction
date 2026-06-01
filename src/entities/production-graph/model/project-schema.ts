import type { AssetRecord, GraphProject } from './types';

export const PROJECT_SCHEMA_VERSION = 1;
export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

export interface ProjectViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectNodeUiState {
  collapsed?: boolean;
  selectedTab?: string;
}

export interface ProjectSectionUiState {
  collapsed?: boolean;
}

export interface ProjectUiState {
  viewport: ProjectViewportState;
  nodes: Record<string, ProjectNodeUiState>;
  sections: Record<string, ProjectSectionUiState>;
}

export interface AssetManifestItem {
  id: string;
  kind: AssetRecord['kind'];
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
  storage: AssetRecord['storage'];
}

export interface ProjectExport {
  schemaVersion: ProjectSchemaVersion;
  exportedAt: string;
  project: GraphProject;
  uiState: ProjectUiState;
  assetsManifest: AssetManifestItem[];
}

export interface PipelineTemplateExport {
  schemaVersion: ProjectSchemaVersion;
  exportedAt: string;
  project: Omit<GraphProject, 'assets' | 'runs'> & {
    assets: AssetRecord[];
    runs: [];
  };
  uiState: ProjectUiState;
  assetsManifest: AssetManifestItem[];
}

export const DEFAULT_PROJECT_VIEWPORT: ProjectViewportState = {
  x: 445,
  y: 250,
  zoom: 0.58,
};

export function createEmptyProjectUiState(): ProjectUiState {
  return {
    viewport: { ...DEFAULT_PROJECT_VIEWPORT },
    nodes: {},
    sections: {},
  };
}

export function normalizeProjectUiState(uiState?: Partial<ProjectUiState>, project?: Pick<GraphProject, 'nodes' | 'sections'>): ProjectUiState {
  const nodeIds = project ? new Set(project.nodes.map((node) => node.id)) : null;
  const sectionIds = project ? new Set(project.sections.map((section) => section.id)) : null;

  return {
    viewport: normalizeViewport(uiState?.viewport),
    nodes: filterRecord(uiState?.nodes, nodeIds),
    sections: filterRecord(uiState?.sections, sectionIds),
  };
}

export function createAssetManifest(assets: AssetRecord[]): AssetManifestItem[] {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
    storage: asset.storage,
  }));
}

export function createProjectExport(project: GraphProject, uiState: ProjectUiState, exportedAt = new Date().toISOString()): ProjectExport {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt,
    project,
    uiState: normalizeProjectUiState(uiState, project),
    assetsManifest: createAssetManifest(project.assets),
  };
}

function normalizeViewport(viewport?: Partial<ProjectViewportState>): ProjectViewportState {
  return {
    x: finiteOrDefault(viewport?.x, DEFAULT_PROJECT_VIEWPORT.x),
    y: finiteOrDefault(viewport?.y, DEFAULT_PROJECT_VIEWPORT.y),
    zoom: finiteOrDefault(viewport?.zoom, DEFAULT_PROJECT_VIEWPORT.zoom),
  };
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function filterRecord<T extends object>(record: Record<string, T> | undefined, allowedIds: Set<string> | null) {
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([id]) => !allowedIds || allowedIds.has(id)),
  ) as Record<string, T>;
}
