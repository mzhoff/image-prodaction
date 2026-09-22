import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { prepareTimelineAudio } from './timeline-audio-import';
import { emptyTimeline, type TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import type { storyRequest } from './story-api';

function fixture(): TimelineSnapshot {
  const assetId = randomUUID();
  return { ...emptyTimeline(), clips: [0, 2000].map((startMs) => ({ id: randomUUID(), assetId, kind: 'video', shotId: null, startMs, sourceInMs: startMs, durationMs: 2000 })) };
}
test('scene import derives one audio source, links each scene and retains source offsets', async () => {
  const snapshot = fixture(), audioId = randomUUID(), workspaceId = randomUUID(), calls: string[] = [];
  const request: typeof storyRequest = async <T>(url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith('/derive')) {
      assert.deepEqual(JSON.parse(init!.body as string), { workspaceId, assetId: snapshot.clips[0].assetId, kind: 'audio' });
      return { asset: { id: audioId, mediaKind: 'audio', status: 'ready' } } as T;
    }
    return { asset: { id: snapshot.clips[0].assetId, video: { audioTracks: [{ index: 1 }] } } } as T;
  };
  const prepared = await prepareTimelineAudio(snapshot, snapshot.clips.map((clip) => clip.id), workspaceId, new AbortController().signal, request);
  assert.equal(calls.length, 2); assert.equal(snapshot.audioClips, undefined);
  assert.equal(prepared.snapshot.audioTracks!.length, 1);
  assert.deepEqual(prepared.snapshot.audioClips!.map((clip) => [clip.sourceInMs, clip.startMs, clip.durationMs, clip.assetId]), [[0, 0, 2000, audioId], [2000, 2000, 2000, audioId]]);
});
test('silent video creates no fake audio; failed derivation never returns a half-added pair', async () => {
  const snapshot = fixture(), ids = snapshot.clips.map((clip) => clip.id);
  const silent: typeof storyRequest = async <T>() => ({ asset: { id: snapshot.clips[0].assetId, video: { audioTracks: [] } } } as T);
  assert.equal((await prepareTimelineAudio(snapshot, ids, randomUUID(), new AbortController().signal, silent)).snapshot.audioClips, undefined);
  const failing: typeof storyRequest = async <T>(url: string) => {
    if (url.endsWith('/derive')) throw new Error('Server unavailable');
    return { asset: { id: snapshot.clips[0].assetId, video: { audioTracks: [{ index: 1 }] } } } as T;
  };
  await assert.rejects(prepareTimelineAudio(snapshot, ids, randomUUID(), new AbortController().signal, failing), /Server unavailable/);
  assert.equal(snapshot.audioClips, undefined); assert.equal(snapshot.clips[0].sourceAudioMuted, undefined);
});
