import { timelineVideoLanes, timelineVideoPositions, PRIMARY_VIDEO_TRACK } from './timeline-video';
import { z } from 'zod';
import { timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { timelineFpsSchema } from '../contracts/timeline-production';

const rational = z.object({ OTIO_SCHEMA: z.literal('RationalTime.1'), value: z.number().finite().min(0), rate: z.number().finite().positive().max(1_000_000) });
const range = z.object({ OTIO_SCHEMA: z.literal('TimeRange.1'), start_time: rational, duration: rational });
const metadata = z.record(z.string(), z.unknown()).optional();
const empty = z.array(z.unknown()).max(0).optional();
const reference = z.object({ OTIO_SCHEMA: z.literal('ExternalReference.1'), target_url: z.string().min(1).max(2048), available_range: range.nullable().optional(), metadata });
const item = z.object({
  OTIO_SCHEMA: z.enum(['Clip.1', 'Clip.2', 'Gap.1']), name: z.string().max(500).optional(),
  source_range: range, effects: empty, markers: empty, metadata,
  media_reference: reference.optional(), media_references: z.record(z.string(), reference).optional(), active_media_reference_key: z.string().optional(),
  enabled: z.literal(true).optional(),
});
const track = z.object({ OTIO_SCHEMA: z.literal('Track.1'), kind: z.enum(['Video', 'Audio']), name: z.string().max(80).optional(),
  enabled: z.literal(true).optional(),
  children: z.array(item).max(1000), effects: empty, markers: empty, source_range: z.null().optional(), metadata,
});
const documentSchema = z.object({ OTIO_SCHEMA: z.literal('Timeline.1'), name: z.string().max(120).optional(), metadata,
  global_start_time: rational.nullable().optional(),
  tracks: z.object({ OTIO_SCHEMA: z.literal('Stack.1'), enabled: z.literal(true).optional(), children: z.array(track).max(48), effects: empty, markers: empty, source_range: z.null().optional() }),
});
const rt = (value: number) => ({ OTIO_SCHEMA: 'RationalTime.1', value, rate: 1000 });
const span = (start: number, duration: number) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: rt(start), duration: rt(duration) });
const ms = (value: z.infer<typeof rational>) => Math.round(value.value * 1000 / value.rate);

/** Restricted OTIO cuts profile. No fetching, path traversal or execution of references. */
export function exportTimelineOtio(name: string, snapshot: TimelineSnapshot, mediaPaths: Record<string, string> = {}) {
  snapshot = timelineSnapshotSchema.parse(snapshot);
  const clip = (assetId: string, sourceInMs: number, durationMs: number, meta: Record<string, unknown>) => ({
    OTIO_SCHEMA: 'Clip.2', name: assetId, source_range: span(sourceInMs, durationMs), effects: [], markers: [], enabled: true,
    media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: mediaPaths[assetId] ?? `asset://${assetId}`, available_range: null, metadata: {} } },
    active_media_reference_key: 'DEFAULT_MEDIA', metadata: { reverie: meta },
  });
  const audioLanes = [
    ...(snapshot.audioTracks ?? []).map((track) => ({ ...track, explicit: true, clips: (snapshot.audioClips ?? []).filter((c) => c.trackId === track.id) })),
    ...(snapshot.audioClips ?? []).filter((c) => !c.trackId).map((c, index) => ({ id: c.id, name: `Audio ${index + 1}`, explicit: false, clips: [c] })),
  ];
  const tracks = [...timelineVideoLanes(snapshot).map((lane) => {
    let at = 0;
    const children = timelineVideoPositions(snapshot).filter((c) => (c.trackId ?? PRIMARY_VIDEO_TRACK) === lane.id).sort((a, b) => a.startMs - b.startMs).flatMap((c) => {
      const gap = c.startMs - at; at = c.startMs + c.durationMs;
      return [...(gap ? [{ OTIO_SCHEMA: 'Gap.1', source_range: span(0, gap), effects: [], markers: [] }] : []), clip(c.assetId, c.sourceInMs, c.durationMs, { id: c.id, kind: c.kind, shotId: c.shotId, ...(c.sourceAudioMuted ? { sourceAudioMuted: true } : {}), locked: snapshot.lockedClipIds?.includes(c.id) ?? false })];
    });
    return { OTIO_SCHEMA: 'Track.1', name: lane.name, kind: 'Video', effects: [], markers: [], source_range: null, children };
  }), ...audioLanes.map((lane) => {
    let at = 0;
    const children = [...lane.clips].sort((a, b) => a.startMs - b.startMs).flatMap((c) => {
      const gap = c.startMs - at; at = c.startMs + c.durationMs;
      return [...(gap ? [{ OTIO_SCHEMA: 'Gap.1', source_range: span(0, gap), effects: [], markers: [] }] : []),
        clip(c.assetId, c.sourceInMs, c.durationMs, { id: c.id, gain: c.gain, ...(c.allowSilentTail ? { allowSilentTail: true } : {}), ...(c.linkedVideoClipId ? { linkedVideoClipId: c.linkedVideoClipId } : {}), ...(c.role ? { role: c.role } : {}) })];
    });
    return { OTIO_SCHEMA: 'Track.1', name: lane.name, kind: 'Audio', effects: [], markers: [], source_range: null,
      ...(lane.explicit ? { metadata: { reverie: { audioTrack: true } } } : {}), children };
  })];
  return { OTIO_SCHEMA: 'Timeline.1', name, global_start_time: rt(0),
    metadata: { reverie: { profile: 'cuts-v1', aspectRatio: snapshot.aspectRatio, frameRate: snapshot.frameRate ?? 30, sourceAudioGain: snapshot.sourceAudioGain ?? 1 } },
    tracks: { OTIO_SCHEMA: 'Stack.1', name: 'Tracks', source_range: null, effects: [], markers: [], children: tracks },
  };
}

export function importTimelineOtio(value: unknown, bindings: Record<string, { assetId: string; kind: 'image' | 'video' | 'audio' }>, createId: () => string): TimelineSnapshot {
  const doc = documentSchema.parse(value);
  if (doc.global_start_time && ms(doc.global_start_time) !== 0) throw new Error('Импорт поддерживает таймлайн с началом в 0.');
  const videos = doc.tracks.children.filter((t) => t.kind === 'Video');
  if (!videos.length || videos.length > 16) throw new Error('Импорт поддерживает от 1 до 16 видеодорожек.');
  if (videos.some((track) => track.children.at(-1)?.OTIO_SCHEMA === 'Gap.1')) throw new Error('Пустой хвост видеодорожки пока не поддерживается. Уберите завершающий Gap.');
  const raw = doc.metadata?.reverie;
  const meta = z.object({ aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'), frameRate: timelineFpsSchema.default(30), sourceAudioGain: z.number().min(0).max(2).default(1) }).parse(raw ?? {});
  const clips: TimelineSnapshot['clips'] = [], audioClips: NonNullable<TimelineSnapshot['audioClips']> = [], lockedClipIds: string[] = [];
  const audioTracks: NonNullable<TimelineSnapshot['audioTracks']> = [], videoTracks: NonNullable<TimelineSnapshot['videoTracks']> = [];
  const importedIds = new Map<string, string>();
  for (const t of doc.tracks.children) {
    const trackInfo = z.object({ audioTrack: z.boolean().optional() }).parse(t.metadata?.reverie ?? {});
    const videoTrackId = t.kind === 'Video' && t !== videos[0] ? createId() : undefined;
    if (videoTrackId) videoTracks.push({ id: videoTrackId, name: t.name?.trim() || `Видео ${videoTracks.length + 1}` });
    const trackId = t.kind === 'Audio' && (trackInfo.audioTrack || !t.children.length || t.children.filter((c) => c.OTIO_SCHEMA !== 'Gap.1').length > 1) ? createId() : undefined;
    if (trackId) audioTracks.push({ id: trackId, name: t.name?.trim() || `Аудио ${audioTracks.length + 1}` });
    let startMs = 0;
    for (const c of t.children) {
      const durationMs = ms(c.source_range.duration), sourceInMs = ms(c.source_range.start_time);
      if (durationMs <= 0) throw new Error('OTIO содержит пустой клип.');
      if (c.OTIO_SCHEMA === 'Gap.1') {
        startMs += durationMs; continue;
      }
      const ref = c.OTIO_SCHEMA === 'Clip.2' ? c.media_references?.[c.active_media_reference_key ?? 'DEFAULT_MEDIA'] : c.media_reference;
      if (!ref || !Object.hasOwn(bindings, ref.target_url)) throw new Error('Сопоставьте каждый исходник OTIO с файлом Workspace.');
      const bound = bindings[ref.target_url];
      if (!z.uuid().safeParse(bound.assetId).success) throw new Error('Неверное сопоставление ассета.');
      const info = z.object({ id: z.uuid().optional(), linkedVideoClipId: z.uuid().optional(), allowSilentTail: z.boolean().optional(), sourceAudioMuted: z.boolean().optional(), gain: z.number().min(0).max(2).default(1), locked: z.boolean().default(false), role: z.enum(['music', 'voice', 'effect']).optional() }).parse(c.metadata?.reverie ?? {});
      const id = createId(); if (info.id) importedIds.set(info.id, id);
      if (t.kind === 'Video') {
        if (bound.kind === 'audio') throw new Error('Аудио нельзя поместить на видеодорожку.');
        clips.push({ id, shotId: null, assetId: bound.assetId, kind: bound.kind, sourceInMs, durationMs, startMs, ...(info.sourceAudioMuted ? { sourceAudioMuted: true } : {}), ...(videoTrackId ? { trackId: videoTrackId } : {}) });
        if (info.locked) lockedClipIds.push(id);
      } else {
        if (bound.kind !== 'audio') throw new Error('Для аудиодорожки требуется отдельный аудиоассет.');
        audioClips.push({ id, ...(trackId ? { trackId } : {}), assetId: bound.assetId, startMs, sourceInMs, durationMs, gain: info.gain, ...(info.allowSilentTail ? { allowSilentTail: true } : {}), ...(info.linkedVideoClipId ? { linkedVideoClipId: info.linkedVideoClipId } : {}), ...(info.role ? { role: info.role } : {}) });
      }
      startMs += durationMs;
    }
  }
  for (const clip of audioClips) { if (clip.linkedVideoClipId) { const mapped = importedIds.get(clip.linkedVideoClipId); if (!mapped) throw new Error('Связанное видео отсутствует в OTIO.'); clip.linkedVideoClipId = mapped; } }
  return timelineSnapshotSchema.parse({ schemaVersion: 1, ...meta, clips, audioClips, lockedClipIds, ...(audioTracks.length ? { audioTracks } : {}), videoTracks });
}
