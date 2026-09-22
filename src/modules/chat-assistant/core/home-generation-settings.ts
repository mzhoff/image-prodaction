import { homeGenerationInputSchema, type HomeGenerationStoredInput } from '../contracts/home-generation';
import type { PinnedHomeImageSettings } from '../contracts/home-image-settings';

/** User controls from the original message take precedence over generated tool arguments. */
export function applyPinnedHomeImageSettings(raw: Record<string, unknown>, pinned?: PinnedHomeImageSettings): HomeGenerationStoredInput {
  const parsed = homeGenerationInputSchema.safeParse(pinned ? { ...raw,
    model: pinned.settings.model, aspectRatio: pinned.settings.aspectRatio, size: pinned.settings.size,
    referenceIndexes: undefined,
  } : raw);
  if (!parsed.success) throw new Error('Уточните описание и параметры изображения.');
  return { ...parsed.data, ...(pinned ? { settingsId: pinned.id, subjects: pinned.subjects,
    ...(pinned.settings.submitAuthorized ? { submitAuthorized: true as const } : {}) } : {}) };
}

export function homeGenerationReferenceCount(attachmentCount: number, subjects: HomeGenerationStoredInput['subjects']) {
  const count = attachmentCount + (subjects ?? []).filter((subject) => subject.reference).length;
  if (count > 4) throw new Error('Можно использовать до четырёх изображений: основные фото героев и ваши референсы. Уберите лишние референсы или героев.');
  return count;
}
