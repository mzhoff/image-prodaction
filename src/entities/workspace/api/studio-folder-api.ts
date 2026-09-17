import type { StudioFolder } from '../model/studio-folder';
export async function fetchStudioFolders(workspaceId: string, signal?: AbortSignal) {
  return folderJson<{ folders: StudioFolder[] }>(`/api/workspaces/${workspaceId}/folders`, { signal }).then((result) => result.folders);
}
export async function saveStudioFolder(workspaceId: string, name: string, id?: string) {
  return folderJson<{ folder: StudioFolder }>(`/api/workspaces/${workspaceId}/folders${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  }).then((result) => result.folder);
}
async function folderJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Не удалось загрузить проекты.');
  return body as T;
}
