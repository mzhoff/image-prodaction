import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';

export interface ProjectMedia {
  id: string;
  workspaceId: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  createdAt: string;
  contentUrl: string;
  thumbnailUrl?: string;
}

export interface ProjectContents {
  stories: StorySummary[];
  timelines: TimelineSummary[];
  media: ProjectMedia[];
  mediaTotal: number;
  nextCursor: string | null;
}
