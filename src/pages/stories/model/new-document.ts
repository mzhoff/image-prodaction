import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { emptyTimeline, type TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { createStorySnapshot, settingsForFormat } from '@/modules/story-projects/core/story-presets';
import { createUuidV7 } from '@/shared/lib/id';

function identity(workspaceId: string, folderId: string | null) {
  const now = new Date().toISOString();
  return { id: createUuidV7(), workspaceId, folderId, revision: 0, createdAt: now, updatedAt: now };
}
export function newStoryDocument(workspaceId: string, folderId: string | null = null): StoryProject {
  return { ...identity(workspaceId, folderId), name: 'Новая история', snapshot: createStorySnapshot(settingsForFormat('free')) };
}
export function newTimelineDocument(workspaceId: string, folderId: string | null = null, storyboardId: string | null = null, promo = false): TimelineDocument {
  return { ...identity(workspaceId, folderId), name: promo ? 'Новый промо-ролик' : 'Новый монтаж', storyboardId,
    snapshot: { ...emptyTimeline(), frameRate: 30, audioTracks: [], audioClips: [], ...(promo ? { production: {
      purpose: 'promo' as const, brief: 'Собрать промо-ролик: вступление, развитие, кульминация и финал.', targetDurationMs: 30_000, pacing: 'mixed' as const, sourceAssetIds: [],
    } } : {}) } };
}
/** Keep the mounted editor and its chat alive when the draft gets a durable address. */
export function publishDocumentAddress(kind: 'storyboard' | 'timeline', id: string, expectedAddress?: string) {
  if (expectedAddress && window.location.href !== expectedAddress) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('document') && url.searchParams.get('document') !== id) return;
  if (url.searchParams.get('draft') && url.searchParams.get('draft') !== id) return;
  if (url.pathname !== '/create' || url.searchParams.get('type') !== kind) return;
  url.searchParams.set('document', id);
  url.searchParams.delete('draft');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
