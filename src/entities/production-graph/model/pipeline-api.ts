import {
  createPipelineConfig,
  createPipelineConfigFromProject,
  type BackendPipelineRecord,
} from './pipeline-config';
import type { PipelineRecord, ProjectUiState } from './project-schema';
import type { GraphProject } from './types';

interface PipelineListResponse {
  pipelines: BackendPipelineRecord[];
}

interface PipelineResponse {
  pipeline: BackendPipelineRecord;
}

interface CreateBackendPipelineInput {
  name: string;
  project: GraphProject;
  uiState: ProjectUiState;
}

export async function fetchBackendPipelines(signal?: AbortSignal): Promise<BackendPipelineRecord[]> {
  const response = await fetch('/api/pipelines', {
    method: 'GET',
    signal,
  });
  const payload = await readJsonResponse<PipelineListResponse>(response);
  return Array.isArray(payload.pipelines) ? payload.pipelines : [];
}

export async function createBackendPipeline(input: CreateBackendPipelineInput): Promise<BackendPipelineRecord> {
  const response = await fetch('/api/pipelines', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      config: createPipelineConfigFromProject(input.project, input.uiState),
    }),
  });
  const payload = await readJsonResponse<PipelineResponse>(response);
  return payload.pipeline;
}

export async function saveBackendPipeline(pipeline: PipelineRecord): Promise<BackendPipelineRecord> {
  const response = await fetch(`/api/pipelines/${pipeline.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: pipeline.title,
      config: createPipelineConfig(pipeline),
    }),
  });
  const payload = await readJsonResponse<PipelineResponse>(response);
  return payload.pipeline;
}

export async function deleteBackendPipeline(pipelineId: string): Promise<void> {
  const response = await fetch(`/api/pipelines/${pipelineId}`, {
    method: 'DELETE',
  });

  if (response.status === 404) return;
  await readJsonResponse(response);
}

async function readJsonResponse<T = unknown>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(getResponseErrorMessage(payload, response.statusText));
  }

  return payload as T;
}

function getResponseErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  return fallback || 'Pipeline request failed.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
