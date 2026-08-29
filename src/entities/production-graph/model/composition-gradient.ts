import type { CompositionLayerGradient } from './node-data-image';

const DEFAULT_GRADIENT_END_COLOR = '#000000';
const DEFAULT_GRADIENT_START_COLOR = '#ffffff';
export const COMPOSITION_GRADIENT_MAX_STOPS = 8;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

export function createDefaultCompositionGradient(color = DEFAULT_GRADIENT_START_COLOR): CompositionLayerGradient {
  const startColor = normalizeGradientColor(color, DEFAULT_GRADIENT_START_COLOR);
  const endColor = startColor.toLowerCase() === DEFAULT_GRADIENT_END_COLOR
    ? DEFAULT_GRADIENT_START_COLOR
    : DEFAULT_GRADIENT_END_COLOR;
  return {
    angle: 90,
    stops: [
      { color: startColor, offset: 0, opacity: 100 },
      { color: endColor, offset: 1, opacity: 100 },
    ],
    type: 'linear',
  };
}

export function normalizeCompositionGradient(value: unknown): CompositionLayerGradient | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'linear' || !Array.isArray(raw.stops)) return undefined;

  const stops = raw.stops.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const stop = item as Record<string, unknown>;
    if (typeof stop.color !== 'string' || !HEX_COLOR_PATTERN.test(stop.color.trim())) return [];
    if (typeof stop.offset !== 'number' || !Number.isFinite(stop.offset)) return [];
    return [{
      color: stop.color.trim().toLowerCase(),
      offset: clamp(stop.offset, 0, 1),
      opacity: normalizeGradientStopOpacity(stop.opacity),
    }];
  }).slice(0, COMPOSITION_GRADIENT_MAX_STOPS).sort((first, second) => first.offset - second.offset);

  if (stops.length < 2) return undefined;
  return {
    angle: normalizeGradientAngle(raw.angle),
    stops,
    type: 'linear',
  };
}

export function getCompositionGradientLine(width: number, height: number, angle: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const radians = ((normalizeGradientAngle(angle) - 90) * Math.PI) / 180;
  const directionX = Math.cos(radians);
  const directionY = Math.sin(radians);
  const halfLength = (Math.abs(safeWidth * directionX) + Math.abs(safeHeight * directionY)) / 2;
  const centerX = safeWidth / 2;
  const centerY = safeHeight / 2;
  return {
    endX: centerX + directionX * halfLength,
    endY: centerY + directionY * halfLength,
    startX: centerX - directionX * halfLength,
    startY: centerY - directionY * halfLength,
  };
}

export function toCssCompositionGradient(gradient: CompositionLayerGradient, opacity = 100) {
  const normalized = normalizeCompositionGradient(gradient);
  if (!normalized) return undefined;
  const stops = normalized.stops
    .map((stop) => `${toCompositionRgba(stop.color, (stop.opacity ?? 100) * clamp(opacity, 0, 100) / 100)} ${Math.round(stop.offset * 10000) / 100}%`)
    .join(', ');
  return `linear-gradient(${normalized.angle}deg, ${stops})`;
}

export function toCompositionRgba(color: string, opacity = 100) {
  const normalized = normalizeGradientColor(color, DEFAULT_GRADIENT_END_COLOR);
  const alpha = clamp(opacity, 0, 100) / 100;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * 1000) / 1000})`;
}

export function normalizeGradientAngle(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 90;
  return ((Math.round(value) % 360) + 360) % 360;
}

function normalizeGradientColor(value: string, fallback: string) {
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function normalizeGradientStopOpacity(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
