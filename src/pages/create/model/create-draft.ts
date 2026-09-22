import { createStorySnapshot, settingsForFormat } from '@/modules/story-projects/core/story-presets';
import type { StorySettings } from '@/modules/story-projects/contracts/story-project';
import { emptyTimeline, type TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { createUuidV7 } from '@/shared/lib/id';

export type DocumentCreationKind = 'storyboard' | 'timeline' | 'flow';
export interface CreationDraft {
  creationId: string; name: string; prompt: string; folderId: string; storyboardId: string;
  story: StorySettings; ratio: TimelineSnapshot['aspectRatio']; frameRate: 24 | 25 | 30 | 50 | 60;
}
export function newCreationDraft(folderId = '', storyboardId = ''): CreationDraft {
  return { creationId: createUuidV7(), name: '', prompt: '', folderId, storyboardId,
    story: settingsForFormat('free'), ratio: '16:9', frameRate: 30 };
}
export function creationPayload(kind: DocumentCreationKind, draft: CreationDraft) {
  const base = { creationId: draft.creationId, name: draft.name.trim() || (kind === 'storyboard' ? 'Новая история' : kind === 'timeline' ? 'Новый монтаж' : 'Новый Flow'), folderId: draft.folderId || null };
  if (kind === 'storyboard') return { ...base, snapshot: createStorySnapshot(draft.story) };
  if (kind === 'timeline') return { ...base, storyboardId: draft.storyboardId || null, snapshot: { ...emptyTimeline(draft.ratio), frameRate: draft.frameRate } };
  return base;
}
export function creationUrl(kind: string, options: { folderId?: string | null; storyboardId?: string | null; documentId?: string } = {}) {
  const params = new URLSearchParams({ type: kind });
  if (options.folderId) params.set('folderId', options.folderId);
  if (options.storyboardId) params.set('storyboardId', options.storyboardId);
  if (options.documentId) params.set('document', options.documentId);
  return `/create?${params}`;
}
export async function submitCreation(workspaceId: string, kind: DocumentCreationKind, draft: CreationDraft) {
  const payload = creationPayload(kind, draft);
  const response = await fetch(kind === 'flow' ? '/api/projects' : `/api/stories${kind === 'timeline' ? '/timelines' : ''}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'flow' ? { ...payload, workspaceId } : payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Не удалось начать работу. Настройки сохранены — попробуйте ещё раз.');
  const id = body?.[kind === 'storyboard' ? 'story' : kind === 'timeline' ? 'timeline' : 'project']?.id;
  if (typeof id !== 'string') throw new Error('Не удалось открыть документ. Попробуйте ещё раз.');
  return id;
}
