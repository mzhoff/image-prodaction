import type { ProjectExport } from '@/entities/production-graph/model/project-schema';

export interface DocumentProject {
  favorite: boolean;
  hasEverHadContent: boolean;
  id: string;
  name: string;
  revision: number;
  schemaVersion: number;
  snapshot?: ProjectExport;
  status: 'active' | 'trash';
  thumbnailAvailable: boolean;
  thumbnailMode: 'auto' | 'manual';
  thumbnailUrl: string;
  workspaceId: string;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    details?: unknown;
    message?: string;
  };
}

export class DocumentApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, payload?: ApiErrorPayload | null) {
    super(payload?.error?.message || `Document request failed with status ${status}.`);
    this.name = 'DocumentApiError';
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}

export async function fetchDocumentProject(projectId: string, signal?: AbortSignal) {
  return requestJson<{ project: DocumentProject }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    cache: 'no-store',
    signal,
  }).then((result) => result.project);
}

export async function saveDocumentProjectSnapshot(
  projectId: string,
  snapshot: ProjectExport,
  expectedRevision: number,
) {
  return requestJson<{ project: DocumentProject }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, snapshot }),
  }).then((result) => result.project);
}

export async function updateDocumentProjectMetadata(
  projectId: string,
  metadata: { favorite?: boolean; name?: string; status?: 'active' | 'trash' },
) {
  return requestJson<{ project: DocumentProject }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  }).then((result) => result.project);
}

export async function discardEmptyDocumentProject(projectId: string) {
  return requestJson<{ discarded: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/discard-empty`,
    { method: 'POST', keepalive: true },
  );
}

export async function uploadDocumentThumbnail(
  projectId: string,
  file: File,
  mode: 'auto' | 'manual',
) {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('mode', mode);

  return requestJson<{ project: DocumentProject }>(
    `/api/projects/${encodeURIComponent(projectId)}/thumbnail`,
    {
      method: 'POST',
      body: formData,
    },
  ).then((result) => result.project);
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
    throw new DocumentApiError(response.status, payload);
  }
  return response.json() as Promise<T>;
}
