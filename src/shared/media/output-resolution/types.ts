export type PixelSize = readonly [width: number, height: number];
export type ResolutionTable = Readonly<Record<string, Readonly<Record<string, PixelSize>>>>;
export interface OutputResolution {
  pixels?: PixelSize;
  /** A model/provider table is a prediction, never the dimensions of an already generated asset. */
  label: string;
  description: string;
  source?: string;
}
export function knownResolution(pixels: PixelSize, source: string): OutputResolution {
  return { pixels, label: `${pixels[0]} × ${pixels[1]} px`, source,
    description: 'Ожидаемый размер по данным модели. Фактические размеры доступны после генерации.' };
}
export function unknownResolution(size?: string, description = 'Для этого сочетания модель не публикует точные размеры. Они будут известны после генерации.'): OutputResolution {
  return { label: size && size !== 'auto' ? `${size} · размер по модели` : 'Размер по модели', description };
}
