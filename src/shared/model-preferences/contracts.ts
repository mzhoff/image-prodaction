export const MODEL_MODALITIES = ['text', 'image', 'video', 'audio'] as const;
export const MODEL_TABS = ['all', 'popular', 'favorites'] as const;
export type ModelModality = typeof MODEL_MODALITIES[number];
export type ModelTab = typeof MODEL_TABS[number];
export interface ModelPreference {
  favorites: string[];
  tab: ModelTab;
  revision: number;
}
export interface AccountModelPreferences {
  accountId: string;
  preferences: Record<ModelModality, ModelPreference>;
  popularity: Record<ModelModality, Record<string, number>>;
}
export type ModelPreferenceChange = { modality: ModelModality } & (
  | { action: 'tab'; tab: ModelTab }
  | { action: 'favorite'; modelId: string; favorite: boolean }
  | { action: 'reorder'; favorites: string[]; expectedRevision: number }
);
function emptyPreference(): ModelPreference { return { favorites: [], tab: 'all', revision: 0 }; }
export function emptyAccountModelPreferences(accountId: string): AccountModelPreferences {
  return {
    accountId,
    preferences: { text: emptyPreference(), image: emptyPreference(), video: emptyPreference(), audio: emptyPreference() },
    popularity: { text: {}, image: {}, video: {}, audio: {} },
  };
}
export class ModelPreferenceConflict extends Error {}
/** Apply explicit, retry-safe actions; adding a favorite never reorders existing favorites. */
export function applyModelPreferenceChange(current: ModelPreference, change: ModelPreferenceChange): ModelPreference {
  if (change.action === 'tab') return { ...current, tab: change.tab };
  if (change.action === 'favorite') return {
    ...current,
    favorites: change.favorite
      ? current.favorites.includes(change.modelId) ? current.favorites : [...current.favorites, change.modelId]
      : current.favorites.filter((id) => id !== change.modelId),
  };
  if (change.expectedRevision !== current.revision || change.favorites.length !== current.favorites.length
    || new Set(change.favorites).size !== change.favorites.length
    || change.favorites.some((id) => !current.favorites.includes(id))) {
    throw new ModelPreferenceConflict('Список изменился в другой вкладке. Обновите его и повторите сортировку.');
  }
  return { ...current, favorites: change.favorites };
}
const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: false });
export function selectModels<T extends { value: string; label: string }>(
  options: T[], tab: ModelTab, favorites: string[], popularity: Record<string, number>, query = '',
): T[] {
  const search = query.trim().toLocaleLowerCase();
  const positions = new Map(favorites.map((id, index) => [id, index]));
  const unique = new Map(options.filter((item) => item.value !== 'openrouter/auto').map((item) => [item.value, item]));
  return [...unique.values()].filter((item) =>
    (!search || `${item.label} ${item.value}`.toLocaleLowerCase().includes(search))
    && (tab !== 'favorites' || positions.has(item.value))
    && (tab !== 'popular' || (popularity[item.value] ?? 0) > 0),
  ).sort((a, b) => {
    if (tab === 'favorites') return positions.get(a.value)! - positions.get(b.value)!;
    if (tab === 'popular') {
      const difference = popularity[b.value] - popularity[a.value];
      if (difference) return difference;
    }
    return alphabet.compare(a.label, b.label) || alphabet.compare(a.value, b.value);
  });
}
