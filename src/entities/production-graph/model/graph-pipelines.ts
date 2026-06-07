import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import {
  createEmptyProjectUiState,
  normalizeProjectUiState,
  type PipelineRecord,
  type ProjectUiState,
} from './project-schema';
import type { GraphProject } from './types';

export const DEFAULT_PIPELINE_TITLE = 'Pipeline 1';

export interface PipelineStatePatch extends GraphProject {
  activePipelineId: string;
  historyFuture: [];
  historyPast: [];
  uiState: ProjectUiState;
}

export interface PipelineStateSnapshot {
  activePipeline: PipelineRecord | null;
  activePipelineId: string;
  pipelines: PipelineRecord[];
}

interface PipelineSourceState extends GraphProject {
  activePipelineId: string;
  pipelines: PipelineRecord[];
  uiState: ProjectUiState;
}

export function createInitialPipeline(now = new Date().toISOString()): PipelineRecord {
  return createPipelineRecord({
    id: createUuidV7(),
    title: DEFAULT_PIPELINE_TITLE,
    project: initialProject,
    uiState: createEmptyProjectUiState(),
    createdAt: now,
    updatedAt: now,
  });
}

export function createPipelineRecord(options: {
  id: string;
  title: string;
  project: GraphProject;
  uiState: ProjectUiState;
  createdAt?: string;
  updatedAt?: string;
}): PipelineRecord {
  const now = new Date().toISOString();
  const project = cloneGraphProject(options.project);

  return {
    id: normalizePipelineId(options.id),
    title: normalizePipelineTitle(options.title, DEFAULT_PIPELINE_TITLE),
    createdAt: normalizeIsoString(options.createdAt, now),
    updatedAt: normalizeIsoString(options.updatedAt, now),
    project,
    uiState: cloneProjectUiState(options.uiState, project),
  };
}

export function createGraphProjectFromState(state: GraphProject): GraphProject {
  return {
    version: state.version,
    nodes: state.nodes,
    sections: state.sections,
    edges: state.edges,
    assets: state.assets,
    presets: state.presets,
    subjects: state.subjects,
    locations: state.locations,
    publications: state.publications,
    runs: state.runs,
    selectedNodeIds: state.selectedNodeIds,
    selectedSectionIds: state.selectedSectionIds,
  };
}

export function createPipelineFromState(
  state: PipelineSourceState,
  pipeline: PipelineRecord | undefined,
  now = new Date().toISOString(),
): PipelineRecord {
  return createPipelineRecord({
    id: pipeline?.id ?? state.activePipelineId,
    title: pipeline?.title ?? DEFAULT_PIPELINE_TITLE,
    createdAt: pipeline?.createdAt ?? now,
    updatedAt: now,
    project: createGraphProjectFromState(state),
    uiState: state.uiState,
  });
}

export function saveActivePipeline(state: PipelineSourceState, now = new Date().toISOString()): PipelineRecord[] {
  if (state.pipelines.length === 0) return [];

  const activePipelineId = isUuidV7(state.activePipelineId)
    ? state.activePipelineId.toLowerCase()
    : state.pipelines[0].id;
  const currentPipeline = state.pipelines.find((pipeline) => pipeline.id === activePipelineId);
  const activePipeline = createPipelineFromState({ ...state, activePipelineId }, currentPipeline, now);

  if (!currentPipeline) return [activePipeline, ...state.pipelines];

  return state.pipelines.map((pipeline) => (
    pipeline.id === activePipelineId ? activePipeline : pipeline
  ));
}

export function createPipelineStatePatch(pipeline: PipelineRecord): PipelineStatePatch {
  return {
    ...cloneGraphProject(pipeline.project),
    activePipelineId: pipeline.id,
    uiState: cloneProjectUiState(pipeline.uiState, pipeline.project),
    historyPast: [],
    historyFuture: [],
  };
}

export function normalizePipelineState(
  pipelinesValue: unknown,
  activePipelineIdValue: unknown,
  fallbackProject: GraphProject,
  fallbackUiState: ProjectUiState,
): PipelineStateSnapshot {
  const now = new Date().toISOString();
  const seenIds = new Set<string>();
  const pipelineIdMap = new Map<string, string>();
  const hasStoredPipelineList = Array.isArray(pipelinesValue);
  const pipelines = hasStoredPipelineList
    ? pipelinesValue.flatMap((value, index) => {
      const normalized = normalizePipelineRecord(value, index, now);
      if (!normalized) return [];
      const id = seenIds.has(normalized.pipeline.id) ? createUuidV7() : normalized.pipeline.id;
      seenIds.add(id);
      if (!pipelineIdMap.has(normalized.sourceId)) pipelineIdMap.set(normalized.sourceId, id);
      return id === normalized.pipeline.id ? [normalized.pipeline] : [{ ...normalized.pipeline, id }];
    })
    : [];

  if (!hasStoredPipelineList && pipelines.length === 0) {
    pipelines.push(createPipelineRecord({
      id: createUuidV7(),
      title: DEFAULT_PIPELINE_TITLE,
      project: fallbackProject,
      uiState: fallbackUiState,
      createdAt: now,
      updatedAt: now,
    }));
  }

  if (pipelines.length === 0) return { activePipeline: null, activePipelineId: '', pipelines };

  const activePipelineIdCandidate = typeof activePipelineIdValue === 'string'
    ? pipelineIdMap.get(activePipelineIdValue.trim().toLowerCase()) ?? activePipelineIdValue.trim().toLowerCase()
    : '';
  const activePipelineId = pipelines.some((pipeline) => pipeline.id === activePipelineIdCandidate)
    ? activePipelineIdCandidate
    : pipelines[0].id;
  const activePipeline = pipelines.find((pipeline) => pipeline.id === activePipelineId) ?? pipelines[0];

  return { activePipeline, activePipelineId, pipelines };
}

export function getNextPipelineTitle(pipelines: Pick<PipelineRecord, 'title'>[]) {
  let index = pipelines.length + 1;
  const titles = new Set(pipelines.map((pipeline) => pipeline.title));
  while (titles.has(`Pipeline ${index}`)) index += 1;
  return `Pipeline ${index}`;
}

export function normalizePipelineTitle(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const title = value.trim().replace(/\s+/g, ' ');
  return title ? title.slice(0, 80) : fallback;
}

export function uniquePipelineTitle(title: string, pipelines: Pick<PipelineRecord, 'title'>[]) {
  const normalizedTitle = normalizePipelineTitle(title, getNextPipelineTitle(pipelines));
  const titles = new Set(pipelines.map((pipeline) => pipeline.title));
  if (!titles.has(normalizedTitle)) return normalizedTitle;

  let index = 2;
  while (titles.has(`${normalizedTitle} ${index}`)) index += 1;
  return `${normalizedTitle} ${index}`;
}

function normalizePipelineRecord(value: unknown, index: number, now: string): { pipeline: PipelineRecord; sourceId: string } | null {
  if (!isRecord(value) || !isRecord(value.project)) return null;

  const project = normalizeProject({ ...initialProject, ...value.project } as GraphProject);
  const sourceId = typeof value.id === 'string' && value.id.trim()
    ? value.id.trim().toLowerCase()
    : `pipeline-${index + 1}`;
  return {
    sourceId,
    pipeline: createPipelineRecord({
      id: sourceId,
      title: normalizePipelineTitle(value.title, `Pipeline ${index + 1}`),
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
      project,
      uiState: normalizeProjectUiState(isRecord(value.uiState) ? value.uiState : undefined, project),
    }),
  };
}

function cloneGraphProject(project: GraphProject): GraphProject {
  return normalizeProject(JSON.parse(JSON.stringify(project)) as GraphProject);
}

function cloneProjectUiState(uiState: ProjectUiState, project: Pick<GraphProject, 'nodes' | 'sections'>): ProjectUiState {
  return normalizeProjectUiState(JSON.parse(JSON.stringify(uiState)) as ProjectUiState, project);
}

function normalizePipelineId(value: string) {
  return isUuidV7(value) ? value.trim().toLowerCase() : createUuidV7();
}

function normalizeIsoString(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
