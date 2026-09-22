import type { StoryMedia, StoryProject, StorySummary, StoryWrite } from '@/modules/story-projects/contracts/story-project';

export class StoryRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.name = 'StoryRequestError'; this.status = status; }
}

export async function storyRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new StoryRequestError(body.error?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.', response.status);
  return body as T;
}
export const loadStories = (workspaceId: string, signal: AbortSignal) => storyRequest<{ stories: StorySummary[] }>(`/api/stories?workspaceId=${workspaceId}`, { signal });
export const loadStory = (id: string, signal?: AbortSignal) => storyRequest<{ story: StoryProject }>(`/api/stories/${id}`, { signal });
export const createStory = (workspaceId: string, input: StoryWrite, creationId?: string) => storyRequest<{ story: StoryProject }>(`/api/stories?workspaceId=${workspaceId}`, { method: 'POST', body: JSON.stringify({ ...input, creationId }) });
export const saveStory = (id: string, revision: number, input: StoryWrite) => storyRequest<{ story: StoryProject }>(`/api/stories/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) });
export const loadStoryMedia = (workspaceId: string, signal: AbortSignal, cursor?: string) => storyRequest<{ items: StoryMedia[]; nextCursor: string | null }>(`/api/assets?workspaceId=${workspaceId}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
export function downloadStory(story: StoryProject) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'story-project-backup', ...story }, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `story-${story.id}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
