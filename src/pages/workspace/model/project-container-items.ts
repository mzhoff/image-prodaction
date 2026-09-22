import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import type { ProjectSummary } from '@/entities/workspace/model/types';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { ProjectMedia } from '@/modules/project-containers/contracts/project-contents';

export const PROJECT_TABS = ['all', 'flows', 'stories', 'timeline', 'media'] as const;
export type ProjectTab = typeof PROJECT_TABS[number];
export interface ProjectFileItem {
  id: string; kind: 'flow' | 'story' | 'timeline' | 'image' | 'video' | 'audio';
  name: string; href: string; updatedAt: string; thumbnailUrl?: string;
}

export function projectTab(value: string | null | undefined): ProjectTab {
  return PROJECT_TABS.includes(value as ProjectTab) ? value as ProjectTab : 'all';
}

export function projectFileItems(input: {
  workspaceId: string; folderId: string; flows: ProjectSummary[]; stories: StorySummary[]; timelines: TimelineSummary[];
  media: ProjectMedia[]; tab: ProjectTab; search: string;
}): ProjectFileItem[] {
  const query = input.search.trim().toLocaleLowerCase();
  const flows: ProjectFileItem[] = input.flows.filter((item) => item.workspaceId === input.workspaceId
    && item.folderId === input.folderId && item.status === 'active').map((item) => ({
    id: item.id, name: item.name, kind: 'flow', href: `/projects/${item.id}`, updatedAt: item.updatedAt,
    thumbnailUrl: item.thumbnailAvailable ? item.thumbnailUrl : undefined,
  }));
  const stories: ProjectFileItem[] = input.stories.filter((item) => item.workspaceId === input.workspaceId
    && item.folderId === input.folderId).map((item) => ({
    id: item.id, name: item.name, kind: 'story', updatedAt: item.updatedAt,
    href: `/stories/${item.id}?view=blueprint`,
  }));
  const timelines: ProjectFileItem[] = input.timelines.filter((item) => item.workspaceId === input.workspaceId && item.folderId === input.folderId).map((item) => ({ id: item.id, name: item.name, kind: 'timeline', updatedAt: item.updatedAt, href: `/stories/timelines/${item.id}` }));
  const media: ProjectFileItem[] = input.media.filter((item) => item.workspaceId === input.workspaceId).map((item) => ({
    id: item.id, name: item.name, kind: item.kind, updatedAt: item.createdAt,
    href: item.kind === 'audio' ? item.contentUrl : `/library/${item.id}`,
    thumbnailUrl: item.thumbnailUrl,
  }));
  const items = input.tab === 'flows' ? flows : input.tab === 'stories' ? stories : input.tab === 'timeline'
    ? timelines : input.tab === 'media' ? media : [...flows, ...stories, ...timelines, ...media];
  return items.filter((item) => item.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
