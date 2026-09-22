/** Bounded onset/tempo baseline. Accents are signal estimates, never semantic downbeats. */
export function analyzeMusicPcm(pcm: Uint8Array, options: { durationMs: number; bpm?: number; beatOffsetMs?: number }) {
  if (pcm.byteLength > 8_000 * 2 * 181 || pcm.byteLength % 2) throw new Error('Неверный размер музыкального сигнала.');
  const samples = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), hop = 80;
  const energy: number[] = [];
  const sampleCount = Math.min(pcm.byteLength / 2, Math.floor(options.durationMs * 8));
  for (let offset = 0; offset < sampleCount; offset += hop) {
    let sum = 0, count = 0;
    for (let index = offset; index < Math.min(offset + hop, sampleCount); index++) { const value = samples.getInt16(index * 2, true) / 32768; sum += value * value; count++; }
    energy.push(Math.sqrt(sum / count));
  }
  const peak = Math.max(0, ...energy);
  const onset = energy.map((value, index) => Math.max(0, value - (energy[index - 1] ?? 0)));
  const norm = onset.reduce((sum, value) => sum + value * value, 0);
  let bpm: number | null = options.bpm ?? null, confidence = options.bpm ? 1 : 0, period = options.bpm ? 6000 / options.bpm : 0;
  if (!bpm && norm > 0.0001 && peak > 0.002) {
    let best = 0;
    for (let lag = 25; lag <= 150; lag++) {
      let dot = 0;
      for (let index = lag; index < onset.length; index++) dot += onset[index] * onset[index - lag];
      const score = dot / norm;
      if (score > best) { best = score; period = lag; }
    }
    confidence = Math.max(0, Math.min(1, best));
    if (confidence >= 0.25) bpm = 6000 / period;
  }
  const beatsMs: number[] = [];
  if (bpm) {
    let phase = (options.beatOffsetMs ?? 0) / 10;
    if (!options.bpm) {
      let best = -1;
      for (let offset = 0; offset < period; offset++) {
        let score = 0;
        for (let index = offset; index < onset.length; index += period) score += onset[Math.round(index)] ?? 0;
        if (score > best) { best = score; phase = offset; }
      }
    }
    for (let index = phase; index * 10 < options.durationMs; index += period) {
      let position = Math.round(index);
      if (!options.bpm) for (let candidate = Math.max(0, Math.round(index - period * 0.12)); candidate <= Math.min(onset.length - 1, Math.round(index + period * 0.12)); candidate++) {
        if ((onset[candidate] ?? 0) > (onset[position] ?? 0)) position = candidate;
      }
      const ms = options.bpm ? Math.round(index * 10) : position * 10;
      if (ms < options.durationMs && ms > (beatsMs.at(-1) ?? -1)) beatsMs.push(ms);
    }
  }
  const curve = [];
  for (let index = 0; index < energy.length; index += 50) curve.push({ timeMs: index * 10, value: peak ? Math.min(1, Math.sqrt(energy.slice(index, index + 50).reduce((sum, value) => sum + value * value, 0) / Math.min(50, energy.length - index)) / peak) : 0 });
  const curvePeak = Math.max(0, ...curve.map((point) => point.value));
  if (curvePeak) for (const point of curve) point.value /= curvePeak;
  return { bpm, confidence, beatsMs, energy: curve, method: options.bpm ? 'manual' as const : 'onset-autocorrelation-v1' as const };
}
