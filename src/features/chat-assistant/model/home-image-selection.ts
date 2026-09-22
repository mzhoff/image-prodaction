import { DEFAULT_IMAGE_MODEL, type OpenRouterModelOption } from '@/shared/api/openrouter-models';

export interface HomeImageSelection { model: string; aspectRatio: string; size: string }
export const DEFAULT_HOME_IMAGE_SELECTION: HomeImageSelection = { model: DEFAULT_IMAGE_MODEL, aspectRatio: '1:1', size: '1K' };

/** Keep selections within the current catalogue, including models with only automatic sizing. */
export function resolveHomeImageSelection(draft: HomeImageSelection, models: OpenRouterModelOption[]) {
  const model = models.find((entry) => entry.id === draft.model)
    ?? models.find((entry) => entry.id === DEFAULT_IMAGE_MODEL) ?? models[0];
  const aspectRatios = model?.aspectRatios?.length ? model.aspectRatios : ['auto'];
  const sizes = model?.sizes?.length ? model.sizes : ['auto'];
  return {
    model, aspectRatios, sizes,
    value: { model: model?.id ?? draft.model,
      aspectRatio: aspectRatios.includes(draft.aspectRatio) ? draft.aspectRatio : aspectRatios[0],
      size: sizes.includes(draft.size) ? draft.size : sizes[0] },
  };
}
