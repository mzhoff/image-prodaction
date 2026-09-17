import { VIDEO_REFERENCE_LIMIT } from './video-generation-contracts';

/** A gallery occupies consecutive reference slots starting at its connected port. */
export function expandVideoReferenceInputs(inputs: Array<{ slot: number; assetIds: string[] }>, descriptions: string[] = []) {
  const occupied = new Set<number>();
  const references: Array<{ assetId: string; slot: number; description: string }> = [];
  for (const input of inputs) {
    if (!input.assetIds.length) throw new Error('Кадры ещё не готовы. Дождитесь подготовки изображений.');
    for (const [offset, assetId] of input.assetIds.entries()) {
      const slot = input.slot + offset;
      if (slot > VIDEO_REFERENCE_LIMIT || references.length >= VIDEO_REFERENCE_LIMIT) {
        throw new Error(`В Generate Video можно передать не больше ${VIDEO_REFERENCE_LIMIT} референсов. Выберите меньше кадров или другой набор фрагментов.`);
      }
      if (occupied.has(slot)) throw new Error(`Галерея занимает reference-${slot}, к которому уже подключено другое изображение. Освободите пересекающиеся входы.`);
      occupied.add(slot);
      references.push({ assetId, slot, description: descriptions[slot - 1] ?? '' });
    }
  }
  return references.sort((a, b) => a.slot - b.slot);
}
