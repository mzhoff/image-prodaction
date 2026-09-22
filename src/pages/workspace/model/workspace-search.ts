import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import type { ProjectSummary } from '@/entities/workspace/model/types';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import type { LibraryAssetItem } from '@/pages/library/model/types';

export const WORKSPACE_SEARCH_SCOPES = ['all', 'flows', 'projects', 'media', 'storyboard', 'timeline'] as const;
export type WorkspaceSearchScope = typeof WORKSPACE_SEARCH_SCOPES[number];
export interface WorkspaceSearchItem {
  id: string; kind: Exclude<WorkspaceSearchScope, 'all'>; name: string; description: string;
  href: string; previewUrl?: string; updatedAt: string; mediaKind?: 'image' | 'video'; contentUrl?: string;
}
export interface WorkspaceSearchInput {
  workspaceId?: string; projects: ProjectSummary[]; folders: StudioFolder[]; scope: WorkspaceSearchScope; query: string;
  stories?: StorySummary[]; timelines?: TimelineSummary[]; media?: LibraryAssetItem[];
}

export function normalizeWorkspaceSearchQuery(query: string) { return query.trim().toLocaleLowerCase(); }
export function workspaceSearchIncludes(scope: WorkspaceSearchScope, kind: WorkspaceSearchItem['kind']) { return scope === 'all' || scope === kind; }

export function workspaceSearchItems(input: WorkspaceSearchInput): WorkspaceSearchItem[] {
  if (!input.workspaceId) return [];
  const query = normalizeWorkspaceSearchQuery(input.query);
  const folders = input.folders.filter((item) => item.workspaceId === input.workspaceId);
  const folderNames = new Map(folders.map((item) => [item.id, item.name]));
  const folderName = (id: string | null | undefined) => id ? folderNames.get(id) ?? '' : '';
  const matches = (...values: (string | null | undefined)[]) => values.some((value) => value?.toLocaleLowerCase().includes(query));
  const inWorkspace = (item: { workspaceId: string }) => item.workspaceId === input.workspaceId;
  const description = (kind: string, folder: string) => folder ? `${kind} · ${folder}` : kind;
  const results: WorkspaceSearchItem[] = [];
  if (workspaceSearchIncludes(input.scope, 'flows')) {
    results.push(...input.projects.filter((item) => inWorkspace(item) && item.status === 'active'
      && matches(item.name, folderName(item.folderId))).map((item): WorkspaceSearchItem => ({
      id: `flows:${item.id}`, kind: 'flows', name: item.name, description: description('Flow', folderName(item.folderId)),
      href: `/projects/${encodeURIComponent(item.id)}`, updatedAt: item.updatedAt,
      previewUrl: item.thumbnailAvailable ? item.thumbnailUrl || undefined : undefined,
    })));
  }
  if (workspaceSearchIncludes(input.scope, 'projects')) {
    results.push(...folders.filter((item) => matches(item.name, folderName(item.parentId))).map((item): WorkspaceSearchItem => ({
      id: `projects:${item.id}`, kind: 'projects', name: item.name, description: description('Проект', folderName(item.parentId)),
      href: `/folders/${encodeURIComponent(item.id)}`, updatedAt: item.updatedAt,
    })));
  }
  if (workspaceSearchIncludes(input.scope, 'storyboard')) {
    results.push(...(input.stories ?? []).filter((item) => inWorkspace(item) && matches(item.name, folderName(item.folderId)))
      .map((item): WorkspaceSearchItem => ({ id: `storyboard:${item.id}`, kind: 'storyboard', name: item.name,
        description: description('Раскадровка', folderName(item.folderId)), updatedAt: item.updatedAt,
        href: `/stories/${encodeURIComponent(item.id)}?view=blueprint` })));
  }
  if (workspaceSearchIncludes(input.scope, 'timeline')) {
    results.push(...(input.timelines ?? []).filter((item) => inWorkspace(item) && matches(item.name, folderName(item.folderId)))
      .map((item): WorkspaceSearchItem => ({ id: `timeline:${item.id}`, kind: 'timeline', name: item.name,
        description: description('Монтаж', folderName(item.folderId)), updatedAt: item.updatedAt,
        href: `/stories/timelines/${encodeURIComponent(item.id)}` })));
  }
  if (workspaceSearchIncludes(input.scope, 'media')) {
    results.push(...(input.media ?? []).filter((item) => inWorkspace(item) && (!item.document || item.document.status === 'active')
      && matches(item.originalName, item.document?.name, item.modelId, item.provider, item.operation)).map((item): WorkspaceSearchItem => ({
      id: `media:${item.id}`, kind: 'media', name: item.originalName,
      description: description(item.mediaKind === 'video' ? 'Видео' : 'Изображение', item.document?.name ?? ''),
      href: `/library?assetId=${encodeURIComponent(item.id)}`, updatedAt: item.createdAt,
      previewUrl: item.thumbnailUrl || (item.mediaKind === 'image' ? item.contentUrl : undefined),
      mediaKind: item.mediaKind, contentUrl: item.contentUrl,
    })));
  }
  return [...new Map(results.map((item) => [item.id, item])).values()].sort((a, b) => {
    const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    return timestamp(b.updatedAt) - timestamp(a.updatedAt) || a.id.localeCompare(b.id);
  });
}
