import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import {
  PROJECT_SCHEMA_VERSION,
  createAssetManifest,
  createProjectExport,
  normalizeProjectUiState,
  type AssetManifestItem,
  type PipelineTemplateExport,
  type PortableProjectExport,
  type ProjectUiState,
} from './project-schema';
import type {
  GraphProject,
  LocationRecord,
  PresetRecord,
  ProductionNode,
  ProductionNodeData,
  SubjectRecord,
} from './types';

export function createProjectSnapshotExport(project: GraphProject, uiState: ProjectUiState) {
  return createProjectExport(project, uiState);
}

export function createPipelineTemplateExport(project: GraphProject, uiState: ProjectUiState, exportedAt = new Date().toISOString()): PipelineTemplateExport {
  const templateProject = createPipelineTemplateProject(project);

  return {
    kind: 'pipelineTemplate',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt,
    project: templateProject,
    uiState: normalizeProjectUiState(uiState, templateProject),
    assetsManifest: [],
  };
}

export function normalizePortableProjectExport(payload: unknown): PortableProjectExport {
  if (!isRecord(payload)) {
    throw new Error('Файл не похож на Reverie project/template JSON.');
  }

  if (payload.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error('Версия project/template JSON пока не поддерживается.');
  }

  if (!isRecord(payload.project)) {
    throw new Error('В JSON не найден project.');
  }

  const project = normalizeProject({ ...initialProject, ...payload.project });
  const uiState = normalizeProjectUiState(
    isRecord(payload.uiState) ? payload.uiState : undefined,
    project,
  );
  const kind = payload.kind === 'pipelineTemplate' ? 'pipelineTemplate' : 'projectSnapshot';

  if (kind === 'pipelineTemplate') {
    return {
      kind,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
      project: createPipelineTemplateProject(project),
      uiState,
      assetsManifest: [],
    };
  }

  return {
    kind,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
    project,
    uiState,
    assetsManifest: normalizeAssetsManifest(payload.assetsManifest, project),
  };
}

function createPipelineTemplateProject(project: GraphProject): PipelineTemplateExport['project'] {
  const normalized = normalizeProject({
    ...project,
    nodes: project.nodes.map(toPipelineTemplateNode),
    assets: [],
    presets: project.presets.map(toPipelineTemplatePreset),
    subjects: project.subjects.map(toPipelineTemplateSubject),
    locations: project.locations.map(toPipelineTemplateLocation),
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  });

  return {
    ...normalized,
    nodes: normalized.nodes.map(stripTemplateRuntimeNodeFields),
  } as PipelineTemplateExport['project'];
}

function stripTemplateRuntimeNodeFields(node: ProductionNode): ProductionNode {
  const data = { ...node.data } as unknown as Record<string, unknown>;
  if (node.type !== 'generateImage' && node.type !== 'refineImage') {
    delete data.activeItemIndex;
    delete data.activeResultIndex;
    delete data.resultAssetIds;
  }
  delete data.imageAssetIds;
  delete data.result;
  delete data.resultAssetId;
  delete data.sourceNodeId;

  return {
    ...node,
    data: data as unknown as ProductionNodeData,
  };
}

function toPipelineTemplateNode(node: ProductionNode): ProductionNode {
  return {
    ...node,
    status: 'idle',
    data: toPipelineTemplateNodeData(node),
  };
}

function toPipelineTemplateNodeData(node: ProductionNode): ProductionNodeData {
  const data = { ...node.data } as Record<string, unknown>;

  delete data.assetId;
  delete data.activeIndex;
  delete data.activeResultIndex;
  delete data.activeItemIndex;
  delete data.activeImageAssetId;
  delete data.activeText;
  delete data.items;
  delete data.imageCount;
  delete data.imageAssetIds;
  delete data.result;
  delete data.resultAssetId;
  delete data.resultAssetIds;
  delete data.resultMetadata;
  delete data.resultTexts;
  delete data.sourceAssetId;
  delete data.sourceAspectRatio;
  delete data.sourceText;
  delete data.sourceNodeId;
  delete data.textCount;
  delete data.cropStateVersion;
  delete data.maskDataUrl;
  delete data.message;
  delete data.libraryImageAssetIds;

  if (node.type === 'generateImage' || node.type === 'refineImage') {
    data.activeResultIndex = -1;
    data.resultAssetIds = [];
  }

  return data as unknown as ProductionNodeData;
}

function toPipelineTemplatePreset(preset: PresetRecord): PresetRecord {
  const { sourceAssetId: _sourceAssetId, ...nextPreset } = preset;
  return nextPreset;
}

function toPipelineTemplateSubject(subject: SubjectRecord): SubjectRecord {
  return {
    ...subject,
    imageAssetIds: [],
    sourceNodeId: undefined,
  };
}

function toPipelineTemplateLocation(location: LocationRecord): LocationRecord {
  return {
    ...location,
    imageAssetIds: [],
    sourceNodeId: undefined,
  };
}

function normalizeAssetsManifest(value: unknown, project: GraphProject): AssetManifestItem[] {
  if (Array.isArray(value)) {
    return value.filter(isAssetManifestItem);
  }

  return createAssetManifest(project.assets);
}

function isAssetManifestItem(value: unknown): value is AssetManifestItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.kind === 'image' || value.kind === 'video' || value.kind === 'audio')
    && typeof value.name === 'string'
    && typeof value.mimeType === 'string'
    && typeof value.createdAt === 'string'
    && isRecord(value.storage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
