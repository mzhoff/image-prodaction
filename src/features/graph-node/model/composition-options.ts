import type { DarkSelectOption } from '@/shared/ui/dark-select';


export const compositionAspectRatioOptions: DarkSelectOption[] = [
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'custom', label: 'Custom' },
];

export const compositionSizeOptions: DarkSelectOption[] = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const compositionSizeLongSide: Record<string, number> = {
  '1K': 1080,
  '2K': 2048,
  '4K': 4096,
};

export const compositionFitOptions: DarkSelectOption[] = [
  { value: 'fit', label: 'Fit' },
  { value: 'fill', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' },
];

export const compositionAlignOptions: DarkSelectOption[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const compositionFontOptions: DarkSelectOption[] = [
  { value: 'Inter, Arial, sans-serif', label: 'Inter' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: '"Times New Roman", serif', label: 'Times' },
];

export const compositionWeightOptions: DarkSelectOption[] = [
  { value: '400', label: 'Regular' },
  { value: '600', label: 'Semi' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Black' },
];

export const compositionBlendModeOptions: DarkSelectOption[] = [
  { value: 'pass-through', label: 'Pass through' },
  { value: 'normal', label: 'Normal' },
  { value: 'darken', label: 'Darken' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'plus-darker', label: 'Plus darker' },
  { value: 'color-burn', label: 'Color burn' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'screen', label: 'Screen' },
  { value: 'plus-lighter', label: 'Plus lighter' },
  { value: 'color-dodge', label: 'Color dodge' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'hard-light', label: 'Hard light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

export function getCompositionCanvasSize(aspectRatio: string | undefined, size: string, fallbackRatio: number) {
  const ratio = parseCompositionAspectRatio(aspectRatio) ?? fallbackRatio;
  const longSide = compositionSizeLongSide[size] ?? compositionSizeLongSide['1K'];
  if (ratio >= 1) {
    return {
      height: Math.round(longSide / ratio),
      width: longSide,
    };
  }
  return {
    height: longSide,
    width: Math.round(longSide * ratio),
  };
}

function parseCompositionAspectRatio(value: string | undefined) {
  if (!value || value === 'custom') return undefined;
  const [rawWidth, rawHeight] = value.split(':').map(Number);
  return rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : undefined;
}
