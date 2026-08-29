export const COMPOSITION_CANVAS_DIMENSION_MIN = 256;
export const COMPOSITION_CANVAS_DIMENSION_MAX = 4096;

export type CompositionCanvasPresetGroup = 'Stories' | 'Social & platforms' | 'Screens & devices' | 'Print';

export interface CompositionCanvasPreset {
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9' | 'custom';
  group: CompositionCanvasPresetGroup;
  height: number;
  id: string;
  label: string;
  width: number;
}

export const compositionCanvasPresetGroups: CompositionCanvasPresetGroup[] = [
  'Stories',
  'Social & platforms',
  'Screens & devices',
  'Print',
];

export const compositionCanvasPresets: CompositionCanvasPreset[] = [
  { id: 'story-full-hd', group: 'Stories', label: 'Story / Reels / Shorts · 1080 × 1920', width: 1080, height: 1920, aspectRatio: '9:16' },
  { id: 'story-2k', group: 'Stories', label: 'Story 2K · 1152 × 2048', width: 1152, height: 2048, aspectRatio: '9:16' },
  { id: 'story-4k', group: 'Stories', label: 'Story 4K · 2160 × 3840', width: 2160, height: 3840, aspectRatio: '9:16' },
  { id: 'social-square', group: 'Social & platforms', label: 'Square post · 1080 × 1080', width: 1080, height: 1080, aspectRatio: '1:1' },
  { id: 'social-portrait', group: 'Social & platforms', label: 'Portrait post · 1080 × 1350', width: 1080, height: 1350, aspectRatio: '4:5' },
  { id: 'social-link-preview', group: 'Social & platforms', label: 'Link preview · 1200 × 630', width: 1200, height: 630, aspectRatio: 'custom' },
  { id: 'video-thumbnail', group: 'Social & platforms', label: 'Video thumbnail · 1280 × 720', width: 1280, height: 720, aspectRatio: '16:9' },
  { id: 'phone-fhd-plus', group: 'Screens & devices', label: 'Phone FHD+ · 1080 × 2400', width: 1080, height: 2400, aspectRatio: 'custom' },
  { id: 'screen-full-hd', group: 'Screens & devices', label: 'Full HD · 1920 × 1080', width: 1920, height: 1080, aspectRatio: '16:9' },
  { id: 'tablet-portrait', group: 'Screens & devices', label: 'Tablet portrait · 2048 × 2732', width: 2048, height: 2732, aspectRatio: 'custom' },
  { id: 'screen-qhd', group: 'Screens & devices', label: 'QHD · 2560 × 1440', width: 2560, height: 1440, aspectRatio: '16:9' },
  { id: 'screen-4k', group: 'Screens & devices', label: '4K UHD · 3840 × 2160', width: 3840, height: 2160, aspectRatio: '16:9' },
  { id: 'print-photo-10x15', group: 'Print', label: '10 × 15 cm · 300 DPI · 1181 × 1772', width: 1181, height: 1772, aspectRatio: 'custom' },
  { id: 'print-a5', group: 'Print', label: 'A5 · 300 DPI · 1748 × 2480', width: 1748, height: 2480, aspectRatio: 'custom' },
  { id: 'print-a4-portrait', group: 'Print', label: 'A4 portrait · 300 DPI · 2480 × 3508', width: 2480, height: 3508, aspectRatio: 'custom' },
  { id: 'print-a4-landscape', group: 'Print', label: 'A4 landscape · 300 DPI · 3508 × 2480', width: 3508, height: 2480, aspectRatio: 'custom' },
];

export function getCompositionCanvasPreset(id: string) {
  return compositionCanvasPresets.find((preset) => preset.id === id);
}

export function getCompositionCanvasPresetId(width: number, height: number) {
  return compositionCanvasPresets.find((preset) => preset.width === width && preset.height === height)?.id ?? 'custom';
}

export function normalizeCompositionCanvasDimension(value: number, fallback: number) {
  return Number.isFinite(value)
    ? Math.min(COMPOSITION_CANVAS_DIMENSION_MAX, Math.max(COMPOSITION_CANVAS_DIMENSION_MIN, Math.round(value)))
    : fallback;
}
