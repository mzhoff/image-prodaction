import { MAX_TIMELINE_DESCRIPTION_CHARACTERS, MAX_TIMELINE_FRAMES_PER_SHOT, MAX_TIMELINE_SHOTS, type TimelineAnalysis, type TimelineShot } from './timeline-contracts';

/** Timestamps are decoded presentation timestamps, not average-frame-rate estimates. */
export function nearestTimelineFrame(times: readonly number[], target: number): number {
  if (!times.length || !Number.isFinite(target)) throw new Error('A valid decoded frame is required.');
  let low = 0; let high = times.length;
  while (low < high) { const middle = (low + high) >>> 1; if (times[middle]! < target) low = middle + 1; else high = middle; }
  const before = times[Math.max(0, low - 1)]!; const after = times[Math.min(low, times.length - 1)]!;
  return target - before <= after - target ? before : after;
}

export function stepTimelineFrame(analysis: TimelineAnalysis, timeMs: number, direction: -1 | 1): number {
  if (direction !== -1 && direction !== 1) throw new Error('Frame direction must be -1 or 1.');
  const nearest = nearestTimelineFrame(analysis.frameTimesMs, timeMs);
  const index = analysis.frameTimesMs.indexOf(nearest);
  return analysis.frameTimesMs[Math.max(0, Math.min(analysis.frameTimesMs.length - 1, index + direction))]!;
}

function shotIndex(analysis: TimelineAnalysis, shotId: string): number {
  const index = analysis.shots.findIndex((shot) => shot.id === shotId);
  if (index === -1) throw new Error('The selected shot no longer exists.');
  return index;
}

function framesInRange(analysis: TimelineAnalysis, startMs: number, endMs: number): number[] {
  const times = analysis.frameTimesMs.filter((time) => time >= startMs && time < endMs);
  if (!times.length) throw new Error('Each shot must contain at least one decoded frame.');
  return times;
}

function resizeShot(analysis: TimelineAnalysis, shot: TimelineShot, startMs: number, endMs: number): TimelineShot {
  const available = framesInRange(analysis, startMs, endMs);
  const frames = shot.frames.filter((frame) => frame.timeMs >= startMs && frame.timeMs < endMs);
  // Preserve user text and its OLD fingerprint: callers can visibly mark the description stale.
  return { ...shot, startMs, endMs, frames: frames.length ? frames : [{ timeMs: nearestTimelineFrame(available, (startMs + endMs) / 2) }] };
}

/** The boundary belongs to BOTH neighbors. Moving it never creates a gap or overlap. */
export function moveTimelineBoundary(analysis: TimelineAnalysis, leftShotId: string, timeMs: number): TimelineAnalysis {
  const index = shotIndex(analysis, leftShotId);
  const left = analysis.shots[index]!; const right = analysis.shots[index + 1];
  if (!right) throw new Error('The final video boundary cannot be moved.');
  const boundary = nearestTimelineFrame(analysis.frameTimesMs, timeMs);
  if (boundary <= left.startMs || boundary >= right.endMs) throw new Error('A boundary must remain inside its two neighboring shots.');
  const shots = analysis.shots.slice();
  shots[index] = resizeShot(analysis, left, left.startMs, boundary);
  shots[index + 1] = resizeShot(analysis, right, boundary, right.endMs);
  return { ...analysis, shots };
}

/** Move the selected shot's start; at the source start create a preceding shot.
 * The selected original id stays on the right, so selection and manual text stay attached. */
export function setTimelineShotStart(analysis: TimelineAnalysis, shotId: string, timeMs: number, newShotId?: string): TimelineAnalysis {
  const index = shotIndex(analysis, shotId);
  if (index > 0) return moveTimelineBoundary(analysis, analysis.shots[index - 1]!.id, timeMs);
  const boundary = nearestTimelineFrame(analysis.frameTimesMs, timeMs);
  if (boundary === analysis.shots[0]!.startMs) return analysis;
  const split = splitTimelineShot(analysis, shotId, boundary, newShotId ?? '');
  const shots = split.shots.slice();
  shots[0] = { ...shots[0]!, id: newShotId! };
  shots[1] = { ...shots[1]!, id: shotId };
  return { ...split, shots };
}

/** Move the shared end, or create a following shot when trimming the final shot. */
export function setTimelineShotEnd(analysis: TimelineAnalysis, shotId: string, timeMs: number, newShotId?: string): TimelineAnalysis {
  const index = shotIndex(analysis, shotId);
  if (index < analysis.shots.length - 1) return moveTimelineBoundary(analysis, shotId, timeMs);
  if (timeMs === analysis.durationMs) return analysis;
  return splitTimelineShot(analysis, shotId, timeMs, newShotId ?? '');
}

export function stepTimelineBoundary(analysis: TimelineAnalysis, leftShotId: string, direction: -1 | 1): TimelineAnalysis {
  const left = analysis.shots[shotIndex(analysis, leftShotId)]!;
  return moveTimelineBoundary(analysis, leftShotId, stepTimelineFrame(analysis, left.endMs, direction));
}

export function splitTimelineShot(analysis: TimelineAnalysis, shotId: string, timeMs: number, newShotId: string): TimelineAnalysis {
  if (analysis.shots.length >= MAX_TIMELINE_SHOTS) throw new Error('A timeline supports at most 100 shots.');
  if (!newShotId || newShotId.length > 80 || analysis.shots.some((shot) => shot.id === newShotId)) throw new Error('A new unique shot identifier is required.');
  const index = shotIndex(analysis, shotId); const shot = analysis.shots[index]!;
  const boundary = nearestTimelineFrame(analysis.frameTimesMs, timeMs);
  if (boundary <= shot.startMs || boundary >= shot.endMs) throw new Error('Choose a frame strictly inside this shot.');
  const shots = analysis.shots.slice();
  shots.splice(index, 1, resizeShot(analysis, shot, shot.startMs, boundary), resizeShot(analysis, { ...shot, id: newShotId }, boundary, shot.endMs));
  return { ...analysis, shots };
}

/** Remove a false cut; scene grouping deliberately does not exist in this MVP. */
export function mergeTimelineShots(analysis: TimelineAnalysis, leftShotId: string): TimelineAnalysis {
  const index = shotIndex(analysis, leftShotId); const left = analysis.shots[index]!; const right = analysis.shots[index + 1];
  if (!right) throw new Error('There is no following shot to merge.');
  const description = [...new Set([left.description, right.description].filter(Boolean))].join('\n');
  if (Array.from(description).length > MAX_TIMELINE_DESCRIPTION_CHARACTERS) throw new Error(`Shorten the two descriptions before merging: together they exceed ${MAX_TIMELINE_DESCRIPTION_CHARACTERS} characters.`);
  const frames = [...left.frames, ...right.frames].sort((a, b) => a.timeMs - b.timeMs);
  if (frames.length > MAX_TIMELINE_FRAMES_PER_SHOT) throw new Error('Remove selected frames before merging: together they exceed five frames.');
  const shots = analysis.shots.slice();
  shots.splice(index, 2, { ...left, endMs: right.endMs, frames, description });
  return { ...analysis, shots };
}

export function selectTimelineFrames(analysis: TimelineAnalysis, shotId: string, timesMs: number[]): TimelineAnalysis {
  if (!timesMs.length || timesMs.length > MAX_TIMELINE_FRAMES_PER_SHOT) throw new Error('Select between one and five frames per shot.');
  const index = shotIndex(analysis, shotId); const shot = analysis.shots[index]!;
  const available = framesInRange(analysis, shot.startMs, shot.endMs);
  if (timesMs.some((time) => !Number.isFinite(time) || time < shot.startMs || time >= shot.endMs)) throw new Error('Selected frames must be inside this shot.');
  const selected = [...new Set(timesMs.map((time) => nearestTimelineFrame(available, time)))].sort((a, b) => a - b);
  const shots = analysis.shots.slice();
  shots[index] = { ...shot, frames: selected.map((timeMs) => shot.frames.find((frame) => frame.timeMs === timeMs) ?? { timeMs }) };
  return { ...analysis, shots };
}

/** Moving a selected still must not carry the old image file to a different timestamp. */
export function moveTimelineFrame(analysis: TimelineAnalysis, shotId: string, frameIndex: number, timeMs: number): TimelineAnalysis {
  const shot = analysis.shots[shotIndex(analysis, shotId)]!;
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= shot.frames.length) throw new Error('The selected frame no longer exists.');
  return selectTimelineFrames(analysis, shotId, shot.frames.map((frame, index) => index === frameIndex ? timeMs : frame.timeMs));
}
