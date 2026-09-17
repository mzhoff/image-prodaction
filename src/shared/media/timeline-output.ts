import type { TimelineAnalysis, TimelineShot } from './timeline-contracts';

export type TimelineOutputScope = 'selected' | 'all';

export function getTimelineOutputShots(analysis: TimelineAnalysis, scope: TimelineOutputScope = 'selected', activeShotIndex = 0): TimelineShot[] {
  if (scope === 'all') return analysis.shots;
  const index = Number.isFinite(activeShotIndex) ? Math.floor(activeShotIndex) : 0;
  const count = analysis.shots.length;
  const shot = count ? analysis.shots[((index % count) + count) % count] : undefined;
  return shot ? [shot] : [];
}

export function timelineClipSignature(analysis: Pick<TimelineAnalysis, 'sourceAssetId' | 'sourceChecksum'>, shot: Pick<TimelineShot, 'startMs' | 'endMs'>) {
  return JSON.stringify(['timeline-clip-v1', analysis.sourceAssetId, analysis.sourceChecksum, shot.startMs, shot.endMs]);
}

/** All selected stills must be prepared; partial galleries must not silently change references. */
export function timelineOutputFrameAssetIds(shots: TimelineShot[]): string[] {
  const frames = shots.flatMap((shot) => [...shot.frames].sort((a, b) => a.timeMs - b.timeMs));
  if (frames.some((frame) => !frame.assetId)) return [];
  return frames.map((frame) => frame.assetId!);
}

export function timelineOutputDescriptions(shots: TimelineShot[]): string {
  return shots.map((shot) => shot.description).join('\n\n');
}
