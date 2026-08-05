'use client';

import type {
  CreatePipelinePlaygroundRunInput,
  PipelinePlaygroundDescriptor,
  PipelinePlaygroundRun,
} from '../../contracts/pipeline-playground-contracts';
import type { PipelineArtifactReference } from '../../contracts/pipeline-contracts';

export async function fetchPipelinePlaygroundDescriptor(endpoint: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/pipeline-playground/descriptor?endpoint=${encodeURIComponent(endpoint)}`,
    { cache: 'no-store', signal },
  );
  const payload = await readJson<{
    pipeline: PipelinePlaygroundDescriptor;
  }>(response, 'Pipeline could not be connected.');
  return payload.pipeline;
}

export async function createPipelinePlaygroundRun(
  input: CreatePipelinePlaygroundRunInput,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/pipeline-playground/runs', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const payload = await readJson<{ run: PipelinePlaygroundRun }>(
    response,
    'Pipeline run could not be started.',
  );
  return payload.run;
}

export async function fetchPipelinePlaygroundRun(runId: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/pipeline-playground/runs/${encodeURIComponent(runId)}`,
    { cache: 'no-store', signal },
  );
  const payload = await readJson<{ run: PipelinePlaygroundRun }>(
    response,
    'Pipeline result could not be loaded.',
  );
  return payload.run;
}

export async function uploadPipelinePlaygroundImage(
  file: File,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<PipelineArtifactReference> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('workspaceId', workspaceId);
  formData.set('documentId', '');
  formData.set('origin', 'uploaded');
  const response = await fetch('/api/assets/images', {
    method: 'POST',
    body: formData,
    signal,
  });
  const payload = await readJson<{
    asset: {
      byteSize: number;
      checksumSha256: string;
      contentType: string;
      height: number | null;
      id: string;
      originalName: string;
      width: number | null;
    };
  }>(response, 'Image could not be uploaded.');
  return {
    kind: 'image',
    assetId: payload.asset.id,
    checksumSha256: payload.asset.checksumSha256,
    mimeType: payload.asset.contentType,
    sizeBytes: payload.asset.byteSize,
    width: payload.asset.width,
    height: payload.asset.height,
    originalName: payload.asset.originalName,
  };
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null) as (
    T & { error?: { message?: string } }
  ) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload;
}
