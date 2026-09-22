import type { MusicAnalysis } from '../contracts/timeline-production';

/** Duration preferences, not a periodic every-N-beats rule. Deterministic for review/retry. */
export function rhythmBoundaries(input: { pacing: 'calm' | 'normal' | 'dynamic' | 'mixed'; music: MusicAnalysis; frames: number; fps: number; energyAt(ms: number): number }) {
  const { music, frames, fps, energyAt } = input;
  const candidates = new Set(music.beatsMs.map((ms) => Math.round(ms * fps / 1000)));
  if (input.pacing === 'dynamic' || input.pacing === 'mixed') {
    music.beatsMs.slice(1).forEach((ms, index) => candidates.add(Math.round((ms + music.beatsMs[index]) * fps / 2000)));
  }
  const ordered = [...candidates].filter((frame) => frame > 0 && frame < frames).sort((a, b) => a - b);
  const boundaries = new Set([0, frames]);
  const variation = [0.7, 0.1, 0.45, 0.95, 0.25, 0.6, 0, 0.85];
  let last = 0, index = 0;
  while (last < frames) {
    const energy = energyAt(last * 1000 / fps);
    const pacing = input.pacing === 'mixed' ? energy > 0.65 ? 'dynamic' : energy > 0.3 ? 'normal' : 'calm' : input.pacing;
    const [min, max] = pacing === 'calm' ? [4, 6] : pacing === 'normal' ? [2, 4] : [0.5, 2];
    const target = last + (min + (max - min) * Math.max(0, Math.min(1, variation[index++ % variation.length] + (0.5 - energy) * 0.2))) * fps;
    const options = ordered.filter((frame) => frame - last >= Math.ceil(min * fps) && frame - last <= Math.ceil(max * fps) && frames - frame >= Math.ceil(min * fps));
    if (!options.length) break;
    const next = options.reduce((best, frame) => {
      const score = (candidate: number) => Math.abs(candidate - target) - Math.abs(energyAt(candidate * 1000 / fps) - energy) * fps * 0.5;
      return score(frame) < score(best) ? frame : best;
    });
    boundaries.add(next); last = next;
  }
  return boundaries;
}
