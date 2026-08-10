export interface FrequencyRetouchValues {
  radius: number;
  rednessReduction: number;
  textureAmount: number;
  toneSmoothing: number;
}

export const MAX_FREQUENCY_RETOUCH_RADIUS = 32;

export function normalizeFrequencyRetouchValues(values: FrequencyRetouchValues) {
  const radius = clamp(values.radius, 2, MAX_FREQUENCY_RETOUCH_RADIUS);
  const toneSmoothing = clamp(values.toneSmoothing, 0, 100);
  return {
    radius,
    rednessReduction: clamp(values.rednessReduction, 0, 100) / 100,
    smoothRadius: clamp(radius + toneSmoothing * 0.28, 2, MAX_FREQUENCY_RETOUCH_RADIUS),
    smoothStrength: toneSmoothing / 100,
    textureAmount: clamp(values.textureAmount, 0, 140) / 100,
  };
}

function clamp(value: number | undefined, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
