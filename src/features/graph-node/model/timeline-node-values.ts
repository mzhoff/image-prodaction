import { MAX_TIMELINE_DESCRIPTION_CHARACTERS, timelineShotFingerprint, type TimelineAnalysis, type TimelineDescriptionResult, type TimelineShot } from '@/shared/media/timeline-contracts';

export interface TimelineDescriptionBaseline { id: string; description: string; fingerprint: string }
export function timelineDescriptionBaselines(shots: TimelineShot[]): TimelineDescriptionBaseline[] {
  return shots.map((shot) => ({ id: shot.id, description: shot.description, fingerprint: timelineShotFingerprint(shot) }));
}

/** Finishing a recovered terminal job must first collect its paid result, not discard it. */
export function recoverTimelineResult(analysis: TimelineAnalysis | undefined, result: TimelineAnalysis | TimelineDescriptionResult | undefined,
  sourceAssetId: string, baselines: TimelineDescriptionBaseline[]): TimelineAnalysis | undefined {
  if (!result || result.sourceAssetId !== sourceAssetId) return analysis;
  if ('version' in result) return result;
  return analysis ? applyTimelineDescriptions(analysis, result, baselines) : analysis;
}

/** A paid response may arrive after a user edit or reload. Never overwrite newer content. */
export function applyTimelineDescriptions(analysis: TimelineAnalysis, result: TimelineDescriptionResult, baselines: TimelineDescriptionBaseline[]): TimelineAnalysis {
  if (analysis.sourceAssetId !== result.sourceAssetId || analysis.sourceChecksum !== result.sourceChecksum) return analysis;
  const descriptions = new Map(result.shots.map((shot) => [shot.id, shot]));
  const originals = new Map(baselines.map((shot) => [shot.id, shot]));
  let changed = false;
  const shots = analysis.shots.map((shot) => {
    const description = descriptions.get(shot.id);
    const baseline = originals.get(shot.id);
    if (!description || !baseline || baseline.description !== shot.description
      || baseline.fingerprint !== timelineShotFingerprint(shot)
      || description.describedFingerprint !== baseline.fingerprint) return shot;
    changed = true;
    const assets = new Map(description.frames?.map((frame) => [frame.timeMs, frame.assetId]));
    return { ...shot, description: limitTimelineDescription(description.description), describedFingerprint: description.describedFingerprint,
      frames: shot.frames.map((frame) => assets.get(frame.timeMs) ? { ...frame, assetId: assets.get(frame.timeMs) } : frame) };
  });
  return changed ? { ...analysis, shots } : analysis;
}

export function limitTimelineDescription(text: string) {
  return Array.from(text).slice(0, MAX_TIMELINE_DESCRIPTION_CHARACTERS).join('');
}

export function formatTimelineTime(timeMs: number): string {
  const milliseconds = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds % 60_000 / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

export function wrapTimelineShotIndex(index: number, total: number) { return total > 0 ? (index % total + total) % total : 0; }

export function timelineUndescribedShots(shots: TimelineShot[]) {
  return shots.filter((shot) => !shot.description || shot.describedFingerprint !== timelineShotFingerprint(shot));
}

export function nearestTimelineFrame(frameTimesMs: number[], timeMs: number, startMs: number, endMs: number) {
  let selected = frameTimesMs.find((time) => time >= startMs && time < endMs) ?? startMs;
  for (const time of frameTimesMs) {
    if (time >= endMs) break;
    if (time >= startMs && Math.abs(time - timeMs) < Math.abs(selected - timeMs)) selected = time;
  }
  return selected;
}
