import type { ProjectSummary, WorkspaceRecord } from '../model/types';
import { trackBehavior } from '@/shared/analytics/client';

interface ApiErrorPayload {
  error?: { message?: string };
}

export async function createWorkspace(name: string, creationId: string): Promise<WorkspaceRecord> {
  const result = await requestJson<{ workspace: { id: string; name: string } }>('/api/workspaces', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, creationId }),
  });
  return { ...result.workspace, members: [] };
}

export async function fetchWorkspaceState(signal?: AbortSignal) {
  const [workspaceResult, projectResult] = await Promise.all([
    requestJson<{ workspaces: Array<{ id: string; name: string }> }>('/api/workspaces', { signal }),
    requestJson<{ projects: ProjectSummary[] }>('/api/projects', { signal }),
  ]);

  const workspaces: WorkspaceRecord[] = workspaceResult.workspaces.map((item) => ({
    ...item,
    members: [],
  }));
  return { workspaces, projects: projectResult.projects };
}

export async function createWorkspaceProject(workspaceId: string, name = 'Untitled Pipeline', folderId?: string | null) {
  return requestJson<{ project: ProjectSummary }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, name, folderId }),
  }).then((result) => {
    trackBehavior('ip_document_created');
    return result.project;
  });
}

export async function updateWorkspaceProject(
  projectId: string,
  patch: Pick<Partial<ProjectSummary>, 'favorite' | 'name' | 'status' | 'folderId' | 'librarySaved'>,
) {
  return requestJson<{ project: ProjectSummary }>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((result) => result.project);
}

export async function deleteWorkspaceProject(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
  if (!response.ok) throw await createResponseError(response);
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, { cache: 'no-store', ...init });
  if (!response.ok) throw await createResponseError(response);
  return response.json() as Promise<T>;
}

async function createResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return new Error(payload?.error?.message || `Request failed with status ${response.status}.`);
}
