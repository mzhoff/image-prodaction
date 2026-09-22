import { analyzeTimelineVideo, withTimelineFrameReader } from '@/shared/media/timeline-processor';
import { analyzeMusicBytes as analyzeMusic } from '@/shared/media/music-processor';
import type { MontageAnalysis } from '@/modules/story-projects/contracts/timeline-production';
import type { RenderMedia } from '@/shared/media/montage-render';
import type { MontagePayload } from './montage-contracts';
import { describeTimelineShot } from './timeline-description';

export async function analyzeMontage(input: {
  payload: MontagePayload; jobId: string; signal: AbortSignal; previous?: MontageAnalysis;
  load(id: string): Promise<RenderMedia>; assertActive(): Promise<void>;
  checkpoint(analysis: MontageAnalysis): Promise<void>;
}, dependencies = { analyzeVideo: analyzeTimelineVideo, analyzeMusic, readFrames: withTimelineFrameReader, describe: describeTimelineShot }) {
  const { payload, signal, load } = input, request = payload.request, settings = payload.snapshot.production;
  if (request.action !== 'analyze' || !settings) throw new Error('Отсутствуют параметры анализа.');
  const analysis: MontageAnalysis = structuredClone(input.previous ?? payload.analysis ?? { version: 1, complete: false, sources: [], completedAssetIds: [], music: null });
  if (analysis.sources.some((s) => payload.checksums[s.assetId] !== s.checksum || !settings.sourceAssetIds.includes(s.assetId))
    || analysis.completedAssetIds.some((id) => !settings.sourceAssetIds.includes(id))
    || (analysis.music && (analysis.music.assetId !== request.musicAssetId || analysis.music.checksum !== payload.checksums[request.musicAssetId]))) throw new Error('Анализ принадлежит другим исходникам.');
  if (analysis.complete) return analysis;
  if (!analysis.music) {
    const media = await load(request.musicAssetId);
    try {
    analysis.music = { version: 1, assetId: request.musicAssetId, checksum: payload.checksums[request.musicAssetId],
      sourceInMs: request.musicSourceInMs, durationMs: settings.targetDurationMs,
      ...await dependencies.analyzeMusic({ bytes: media.bytes, sourceInMs: request.musicSourceInMs, durationMs: settings.targetDurationMs,
        bpm: request.bpm, beatOffsetMs: request.beatOffsetMs, signal }) };
    await input.checkpoint(analysis);
    } finally { await media.dispose?.(); }
  }
  // Detect the entire catalogue before any paid descriptions, so the cost cap is checked first.
  const catalogue = [];
  let shotCount = analysis.sources.filter((s) => analysis.completedAssetIds.includes(s.assetId)).length;
  for (const assetId of settings.sourceAssetIds) {
    if (analysis.completedAssetIds.includes(assetId)) continue;
    await input.assertActive(); signal.throwIfAborted();
    const media = await load(assetId);
    const detected = await dependencies.analyzeVideo({ bytes: media.bytes, signal }).finally(() => media.dispose?.());
    shotCount += detected.shots.length;
    if (shotCount > 60) throw new Error('За один анализ поддерживается до 60 сцен. Выберите меньше исходников.');
    catalogue.push({ assetId, detected });
  }
  for (const { assetId, detected } of catalogue) {
    const media = await load(assetId);
    await dependencies.readFrames({ bytes: media.bytes, signal }, async (extract) => {
      for (const [index, range] of detected.shots.entries()) {
        const id = `${assetId}:${index}`;
        if (analysis.sources.some((source) => source.id === id)) continue;
        await input.assertActive(); signal.throwIfAborted();
        const times = detected.frameTimesMs.filter((time) => time >= range.startMs && time < range.endMs);
        if (!times.length) throw new Error('В сцене не найдено кадров.');
        const selected = [...new Set([times[0], times[Math.floor(times.length / 2)], times.at(-1)!])];
        const shot = { id, startMs: range.startMs, endMs: range.endMs, frames: selected.map((timeMs) => ({ timeMs })), description: '' };
        const images = [];
        for (const timeMs of selected) images.push(await extract(timeMs));
        const description = await dependencies.describe({ shot, images, model: request.model, language: 'Russian',
          actorUserId: payload.userId, workspaceId: payload.workspaceId, parentJobId: input.jobId, signal });
        analysis.sources.push({ id, assetId, checksum: payload.checksums[assetId], startMs: Math.ceil(range.startMs), endMs: Math.floor(range.endMs), description: description.description });
        await input.checkpoint(analysis);
      }
    }).finally(() => media.dispose?.());
    analysis.completedAssetIds.push(assetId); await input.checkpoint(analysis);
  }
  analysis.complete = true; await input.checkpoint(analysis);
  return analysis;
}
