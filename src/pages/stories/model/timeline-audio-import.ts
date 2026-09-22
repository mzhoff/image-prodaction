import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { attachTimelineAudio } from '@/modules/story-projects/core/timeline-linked-clips';
import { createUuidV7 } from '@/shared/lib/id';
import { storyRequest } from './story-api';
import type { TimelineLibraryAsset } from './use-timeline-production-library';

/** Derivatives are cached by the existing asset service; the original video stays intact. */
export async function prepareTimelineAudio(snapshot: TimelineSnapshot, ids: string[], workspaceId: string, signal: AbortSignal, request: typeof storyRequest = storyRequest) {
  let next = snapshot;
  const sources = new Map<string, TimelineLibraryAsset>(), derivatives = new Map<string, TimelineLibraryAsset>();
  for (const id of ids) {
    const clip = next.clips.find((item) => item.id === id);
    if (!clip || clip.kind !== 'video' || clip.sourceAudioMuted) continue;
    let source = sources.get(clip.assetId);
    if (!source) { source = (await request<{ asset: TimelineLibraryAsset }>(`/api/assets/${clip.assetId}`, { signal })).asset; sources.set(clip.assetId, source); }
    if (!source.video?.audioTracks?.length) continue;
    let audio = derivatives.get(clip.assetId);
    if (!audio) {
      audio = (await request<{ asset: TimelineLibraryAsset }>('/api/assets/video/derive', { method: 'POST', signal, body: JSON.stringify({ workspaceId, assetId: clip.assetId, kind: 'audio' }) })).asset;
      derivatives.set(clip.assetId, audio);
    }
    if (audio.mediaKind !== 'audio' || audio.status !== 'ready') throw new Error('Не удалось подготовить звуковую дорожку видео.');
    next = attachTimelineAudio(next, id, audio.id, createUuidV7);
  }
  return { snapshot: next, assets: [...sources.values(), ...derivatives.values()] };
}
