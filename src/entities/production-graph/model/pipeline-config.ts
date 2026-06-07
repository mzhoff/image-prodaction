import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProjectUiState,
  normalizeProjectUiState,
  type PipelineRecord,
  type ProjectUiState,
} from './project-schema';
import { createPipelineRecord } from './graph-pipelines';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import type { GraphProject } from './types';

export interface BackendPipelineRecord {
  config: unknown;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
  userId: string;
}

export function createPipelineConfig(pipeline: PipelineRecord): Record<string, unknown> {
  return createPipelineConfigFromProject(pipeline.project, pipeline.uiState);
}

export function createPipelineConfigFromProject(
  sourceProject: GraphProject,
  sourceUiState: ProjectUiState,
): Record<string, unknown> {
  const project = normalizeProject(sourceProject);

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project,
    uiState: normalizeProjectUiState(sourceUiState, project),
  };
}

export function createPipelineRecordFromBackend(
  pipeline: BackendPipelineRecord,
  index: number,
): PipelineRecord {
  const config = isRecord(pipeline.config) ? pipeline.config : {};
  const project = normalizeBackendProject(config.project);
  const uiState = normalizeBackendUiState(config.uiState, project);

  return createPipelineRecord({
    id: pipeline.id,
    title: pipeline.name || `Pipeline ${index + 1}`,
    project,
    uiState,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  });
}

function normalizeBackendProject(value: unknown): GraphProject {
  return normalizeProject({
    ...initialProject,
    ...(isRecord(value) ? value : {}),
  } as GraphProject);
}

function normalizeBackendUiState(value: unknown, project: GraphProject): ProjectUiState {
  return normalizeProjectUiState(
    isRecord(value) ? value : createEmptyProjectUiState(),
    project,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
