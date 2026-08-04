'use client';

import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import type { StudioPipelinePublication } from '../../contracts/pipeline-publication-contracts';

export class StudioPipelinePublicationApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioPipelinePublicationApiError';
  }
}

export async function fetchStudioPipelinePublications(projectId: string, signal?: AbortSignal) {
  return requestJson<{ pipelines: StudioPipelinePublication[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/pipelines`,
    { cache: 'no-store', signal },
  ).then((result) => result.pipelines);
}

export async function publishStudioPipelineSection(
  projectId: string,
  sectionId: string,
  snapshot: ProjectExport,
) {
  return requestJson<{ pipeline: StudioPipelinePublication }>(
    `/api/projects/${encodeURIComponent(projectId)}/pipelines`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, snapshot }),
    },
  ).then((result) => result.pipeline);
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new StudioPipelinePublicationApiError(
      payload?.error?.message || `Pipeline request failed with status ${response.status}.`,
    );
  }
  return response.json() as Promise<T>;
}
