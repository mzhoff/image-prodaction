import type { CompositionLayerShadow } from './node-data-image';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

export const DEFAULT_COMPOSITION_SHADOW: CompositionLayerShadow = {
  blur: 24,
  color: '#000000',
  offsetX: 0,
  offsetY: 12,
  opacity: 25,
};

export function normalizeCompositionShadow(value: unknown): CompositionLayerShadow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return {
    blur: normalizeNumber(raw.blur, DEFAULT_COMPOSITION_SHADOW.blur, 0, 500),
    color: normalizeColor(raw.color, DEFAULT_COMPOSITION_SHADOW.color),
    offsetX: normalizeNumber(raw.offsetX, DEFAULT_COMPOSITION_SHADOW.offsetX, -4096, 4096),
    offsetY: normalizeNumber(raw.offsetY, DEFAULT_COMPOSITION_SHADOW.offsetY, -4096, 4096),
    opacity: normalizeNumber(raw.opacity, DEFAULT_COMPOSITION_SHADOW.opacity, 0, 100),
  };
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
