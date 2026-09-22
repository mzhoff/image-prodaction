import type { ProjectContents } from '@/modules/project-containers/contracts/project-contents';

export async function loadProjectContents(workspaceId: string, folderId: string,
  search: string, signal: AbortSignal, cursor?: string | null): Promise<ProjectContents> {
  const params = new URLSearchParams({ workspaceId });
  if (search) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/folders/${encodeURIComponent(folderId)}/contents?${params}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Проект недоступен в выбранном Workspace.' : 'Не удалось загрузить файлы проекта. Попробуйте ещё раз.');
  return response.json() as Promise<ProjectContents>;
}
