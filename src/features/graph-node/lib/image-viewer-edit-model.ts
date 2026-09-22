import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';

/** Keep the edit model aligned with the exact model recorded on this result. */
export function getEditDefaultModel(sourceModelId?: string) {
  return sourceModelId ?? DEFAULT_IMAGE_MODEL;
}
