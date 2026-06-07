export const CURVE_CHANNEL_IDS = ['master', 'red', 'green', 'blue'] as const;

export type CurveChannelId = typeof CURVE_CHANNEL_IDS[number];

export interface CurvePoint {
  id: string;
  x: number;
  y: number;
}

export type CurvePointMap = Record<CurveChannelId, CurvePoint[]>;

export interface CurvesAdjustmentValues {
  curves: CurvePointMap;
  opacity: number;
}

const DEFAULT_CURVE_POINTS: CurvePoint[] = [
  { id: 'black', x: 0, y: 0 },
  { id: 'white', x: 1, y: 1 },
];

export function createDefaultCurvePoints(): CurvePoint[] {
  return DEFAULT_CURVE_POINTS.map((point) => ({ ...point }));
}

export function createDefaultCurves(): CurvePointMap {
  return {
    blue: createDefaultCurvePoints(),
    green: createDefaultCurvePoints(),
    master: createDefaultCurvePoints(),
    red: createDefaultCurvePoints(),
  };
}

export function normalizeCurves(value?: Partial<Record<CurveChannelId, CurvePoint[]>>): CurvePointMap {
  return {
    blue: normalizeCurvePoints(value?.blue),
    green: normalizeCurvePoints(value?.green),
    master: normalizeCurvePoints(value?.master),
    red: normalizeCurvePoints(value?.red),
  };
}

export function normalizeCurvePoints(points?: CurvePoint[]): CurvePoint[] {
  const usablePoints = (points ?? [])
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      id: point.id || createCurvePointId(),
      x: clamp01(point.x),
      y: clamp01(point.y),
    }));

  const interiorPoints = usablePoints
    .filter((point) => point.x > 0 && point.x < 1)
    .sort((left, right) => left.x - right.x)
    .filter((point, index, sorted) => index === 0 || Math.abs(point.x - sorted[index - 1].x) > 0.002);

  const blackPoint = usablePoints.find((point) => point.id === 'black' || point.x <= 0.002);
  const whitePoint = usablePoints.find((point) => point.id === 'white' || point.x >= 0.998);

  return [
    { id: 'black', x: 0, y: blackPoint ? clamp01(blackPoint.y) : 0 },
    ...interiorPoints,
    { id: 'white', x: 1, y: whitePoint ? clamp01(whitePoint.y) : 1 },
  ];
}

export function createCurvePointId() {
  return `point-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildCurveLut(points: CurvePoint[]) {
  const normalizedPoints = normalizeCurvePoints(points);
  const lut = new Uint8Array(256);
  const interpolator = createMonotoneInterpolator(normalizedPoints);

  for (let index = 0; index < lut.length; index += 1) {
    lut[index] = clampByte(Math.round(interpolator(index / 255) * 255));
  }

  return lut;
}

export function buildCurvesLutTextureData(curves: CurvePointMap) {
  const textureData = new Uint8Array(256 * CURVE_CHANNEL_IDS.length * 4);

  CURVE_CHANNEL_IDS.forEach((channel, rowIndex) => {
    const lut = buildCurveLut(curves[channel]);
    for (let index = 0; index < lut.length; index += 1) {
      const offset = (rowIndex * 256 + index) * 4;
      textureData[offset] = lut[index];
      textureData[offset + 1] = lut[index];
      textureData[offset + 2] = lut[index];
      textureData[offset + 3] = 255;
    }
  });

  return textureData;
}

export function applyCurvesToPixels(pixels: Uint8ClampedArray, values: CurvesAdjustmentValues, maskPixels?: Uint8ClampedArray) {
  const curves = normalizeCurves(values.curves);
  const masterLut = buildCurveLut(curves.master);
  const redLut = buildCurveLut(curves.red);
  const greenLut = buildCurveLut(curves.green);
  const blueLut = buildCurveLut(curves.blue);
  const opacity = clamp01(values.opacity / 100);

  for (let index = 0; index < pixels.length; index += 4) {
    const amount = opacity * (maskPixels ? (maskPixels[index + 3] / 255) : 1);
    if (amount <= 0) continue;

    const originalRed = pixels[index];
    const originalGreen = pixels[index + 1];
    const originalBlue = pixels[index + 2];
    const curvedRed = redLut[masterLut[originalRed]];
    const curvedGreen = greenLut[masterLut[originalGreen]];
    const curvedBlue = blueLut[masterLut[originalBlue]];

    pixels[index] = mixByte(originalRed, curvedRed, amount);
    pixels[index + 1] = mixByte(originalGreen, curvedGreen, amount);
    pixels[index + 2] = mixByte(originalBlue, curvedBlue, amount);
  }
}

function createMonotoneInterpolator(points: CurvePoint[]) {
  const sorted = normalizeCurvePoints(points);
  const length = sorted.length;
  const slopes = new Array<number>(Math.max(0, length - 1));
  const tangents = new Array<number>(length).fill(0);

  for (let index = 0; index < length - 1; index += 1) {
    const dx = sorted[index + 1].x - sorted[index].x || Number.EPSILON;
    slopes[index] = (sorted[index + 1].y - sorted[index].y) / dx;
  }

  tangents[0] = slopes[0] ?? 0;
  tangents[length - 1] = slopes[length - 2] ?? 0;
  for (let index = 1; index < length - 1; index += 1) {
    tangents[index] = (slopes[index - 1] + slopes[index]) / 2;
  }

  for (let index = 0; index < length - 1; index += 1) {
    if (Math.abs(slopes[index]) < Number.EPSILON) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const left = tangents[index] / slopes[index];
    const right = tangents[index + 1] / slopes[index];
    const scale = Math.hypot(left, right);
    if (scale > 3) {
      const factor = 3 / scale;
      tangents[index] = factor * left * slopes[index];
      tangents[index + 1] = factor * right * slopes[index];
    }
  }

  return (x: number) => {
    const input = clamp01(x);
    const segmentIndex = findSegment(sorted, input);
    const left = sorted[segmentIndex];
    const right = sorted[segmentIndex + 1];
    const width = right.x - left.x || Number.EPSILON;
    const t = (input - left.x) / width;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return clamp01(
      h00 * left.y
      + h10 * width * tangents[segmentIndex]
      + h01 * right.y
      + h11 * width * tangents[segmentIndex + 1],
    );
  };
}

function findSegment(points: CurvePoint[], x: number) {
  for (let index = 0; index < points.length - 2; index += 1) {
    if (x <= points[index + 1].x) return index;
  }
  return points.length - 2;
}

function mixByte(left: number, right: number, amount: number) {
  return clampByte(Math.round(left + (right - left) * amount));
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
