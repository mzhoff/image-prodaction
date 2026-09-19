import type { CropRect } from '@/entities/production-graph/model/types';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { aspectRatioValue, fitCropToOutputAspectPreservingOrigin } from '../lib/crop-geometry';

export const cropAspectRatioSelectOptions: DarkSelectOption[] = [
  { value: 'Custom', label: 'Custom' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
];

export function getSourceAspectRatioLabel(width: number, height: number) {
  const ratio = width / height;
  const match = cropAspectRatioSelectOptions.find((option) => {
    if (option.value === 'Custom') return false;
    const [optionWidth, optionHeight] = option.value.split(':').map(Number);
    return Math.abs(optionWidth / optionHeight - ratio) < 0.01;
  });

  return match?.value ?? 'Custom';
}

export function getCropForSourceChange({
  crop,
  nextSourceAspectRatio,
  previousSourceAspectRatio,
  selectedAspectRatio,
}: {
  crop: CropRect;
  nextSourceAspectRatio?: number;
  previousSourceAspectRatio?: number;
  selectedAspectRatio?: string;
}) {
  if (!nextSourceAspectRatio) return crop;

  const fixedOutputAspectRatio = selectedAspectRatio ? aspectRatioValue(selectedAspectRatio) : null;
  const customOutputAspectRatio = previousSourceAspectRatio && crop.height > 0
    ? (crop.width * previousSourceAspectRatio) / crop.height
    : null;
  const outputAspectRatio = fixedOutputAspectRatio ?? customOutputAspectRatio;

  return outputAspectRatio
    ? fitCropToOutputAspectPreservingOrigin(crop, nextSourceAspectRatio, outputAspectRatio)
    : crop;
}
