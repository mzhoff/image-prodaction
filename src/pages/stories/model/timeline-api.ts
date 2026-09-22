import type { TimelineDocument, TimelineSummary, TimelineWrite } from '@/modules/story-projects/contracts/story-timeline';
import { storyRequest } from './story-api';
export const loadTimelines = (workspaceId: string, signal: AbortSignal) => storyRequest<{ timelines: TimelineSummary[] }>(`/api/stories/timelines?workspaceId=${workspaceId}`, { signal });
export const loadTimeline = (id: string, signal: AbortSignal) => storyRequest<{ timeline: TimelineDocument }>(`/api/stories/timelines/${id}`, { signal });
export const createTimeline = (workspaceId: string, input: TimelineWrite, creationId?: string) => storyRequest<{ timeline: TimelineDocument }>(`/api/stories/timelines?workspaceId=${workspaceId}`, { method: 'POST', body: JSON.stringify({ ...input, creationId }) });
export const saveTimeline = (id: string, revision: number, input: TimelineWrite) => storyRequest<{ timeline: TimelineDocument }>(`/api/stories/timelines/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision }) });

export function downloadTimeline(timeline: TimelineDocument) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'timeline-backup', ...timeline }, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `timeline-${timeline.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
