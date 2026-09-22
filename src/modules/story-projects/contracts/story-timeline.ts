import { z } from 'zod';
import { storyClipSchema, type StorySummary } from './story-project';
import { timelineAudioClipSchema, timelineFpsSchema, timelineProductionSchema } from './timeline-production';

export const timelineClipSchema = storyClipSchema.safeExtend({ trackId: z.uuid().optional(), startMs: z.number().int().min(0).max(7_200_000).optional(), sourceAudioMuted: z.boolean().optional() });
export const timelineTrackSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) }).strict();
export const timelineSnapshotSchema = z.object({
  schemaVersion: z.literal(1), aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  clips: z.array(timelineClipSchema).max(500),
  videoTracks: z.array(timelineTrackSchema).max(15).optional(),
  frameRate: timelineFpsSchema.optional(), audioClips: z.array(timelineAudioClipSchema).max(32).optional(),
  audioTracks: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) }).strict()).max(32).optional(),
  sourceAudioGain: z.number().finite().min(0).max(2).optional(),
  lockedClipIds: z.array(z.uuid()).max(500).optional(), production: timelineProductionSchema.optional(),
}).strict().superRefine((snapshot, ctx) => {
  if (new Set(snapshot.clips.map((clip) => clip.id)).size !== snapshot.clips.length) ctx.addIssue({ code: 'custom', message: 'Клипы должны иметь уникальные id.' });
  let cursor = 0;
  const positions = snapshot.clips.map((clip) => {
    const startMs = clip.startMs ?? cursor;
    if (!clip.trackId) cursor = startMs + clip.durationMs;
    return { ...clip, startMs };
  });
  const duration = Math.max(0, ...positions.map((clip) => clip.startMs + clip.durationMs), ...(snapshot.audioClips ?? []).map((clip) => clip.startMs + clip.durationMs));
  if (duration > 7_200_000) ctx.addIssue({ code: 'custom', message: 'Монтаж не может превышать два часа.' });
  const videoTracks = snapshot.videoTracks ?? [];
  if (new Set(videoTracks.map((track) => track.id)).size !== videoTracks.length) ctx.addIssue({ code: 'custom', message: 'Видеодорожки должны иметь уникальные id.' });
  for (const clip of snapshot.clips) {
    if (clip.trackId && (clip.startMs === undefined || !videoTracks.some((track) => track.id === clip.trackId))) ctx.addIssue({ code: 'custom', message: 'Укажите видеодорожку и положение клипа.' });
  }
  for (const track of [{ id: undefined }, ...videoTracks]) {
    const clips = positions.filter((clip) => clip.trackId === track.id).sort((a, b) => a.startMs - b.startMs);
    if (clips.some((clip, index) => index > 0 && clip.startMs! < clips[index - 1].startMs! + clips[index - 1].durationMs)) ctx.addIssue({ code: 'custom', message: 'Для наложения кадров используйте разные видеодорожки.' });
  }
  const tracks = snapshot.audioTracks ?? [];
  if (new Set(tracks.map((track) => track.id)).size !== tracks.length) ctx.addIssue({ code: 'custom', message: 'Дорожки должны иметь уникальные id.' });
  if (snapshot.audioClips?.some((clip) => clip.trackId && !tracks.some((track) => track.id === clip.trackId))) ctx.addIssue({ code: 'custom', message: 'Аудиодорожка не найдена.' });
  for (const track of tracks) {
    const clips = (snapshot.audioClips ?? []).filter((clip) => clip.trackId === track.id).sort((a, b) => a.startMs - b.startMs);
    if (clips.some((clip, i) => i > 0 && clip.startMs < clips[i - 1].startMs + clips[i - 1].durationMs)) ctx.addIssue({ code: 'custom', message: 'Для наложения звуков используйте разные дорожки.' });
  }
  if (tracks.length + (snapshot.audioClips ?? []).filter((clip) => !clip.trackId).length > 32) ctx.addIssue({ code: 'custom', message: 'Не более 32 аудиодорожек.' });
  if (new Set(snapshot.audioClips?.map((clip) => clip.id)).size !== (snapshot.audioClips?.length ?? 0)) ctx.addIssue({ code: 'custom', message: 'Аудиоклипы должны иметь уникальные id.' });
  const links = (snapshot.audioClips ?? []).filter((clip) => clip.linkedVideoClipId);
  if (new Set(links.map((clip) => clip.linkedVideoClipId)).size !== links.length) ctx.addIssue({ code: 'custom', message: 'У видео может быть только один связанный аудиофрагмент.' });
  for (const audio of links) {
    const video = positions.find((clip) => clip.id === audio.linkedVideoClipId && clip.kind === 'video');
    if (!video || !video.sourceAudioMuted || video.startMs !== audio.startMs || video.durationMs !== audio.durationMs || video.sourceInMs !== audio.sourceInMs) ctx.addIssue({ code: 'custom', message: 'Связанные видео и звук должны оставаться синхронными.' });
  }
  if (new Set(snapshot.lockedClipIds).size !== (snapshot.lockedClipIds?.length ?? 0) || snapshot.lockedClipIds?.some((id) => !snapshot.clips.some((clip) => clip.id === id))) ctx.addIssue({ code: 'custom', message: 'Закреплённый клип отсутствует в монтаже.' });
});
export const timelineWriteSchema = z.object({
  name: z.string().trim().min(1).max(120), folderId: z.uuid().nullable(),
  storyboardId: z.uuid().nullable(), snapshot: timelineSnapshotSchema,
}).strict();
export const timelineSaveSchema = timelineWriteSchema.extend({ expectedRevision: z.number().int().min(0) });
export type TimelineSnapshot = z.infer<typeof timelineSnapshotSchema>;
export type TimelineWrite = z.infer<typeof timelineWriteSchema>;
export interface TimelineSummary extends StorySummary { storyboardId: string | null }
export interface TimelineDocument extends TimelineSummary { snapshot: TimelineSnapshot }
export function emptyTimeline(aspectRatio: TimelineSnapshot['aspectRatio'] = '16:9'): TimelineSnapshot {
  return { schemaVersion: 1, aspectRatio, clips: [] };
}
