import { isHomeReferenceTooLarge, loadHomeLibraryReferenceFile, type HomeLibraryReference } from '../api/home-library-reference-api';

export function toggleHomeLibrarySelection(selected: HomeLibraryReference[], item: HomeLibraryReference, limit: number) {
  if (selected.some((value) => value.id === item.id)) return selected.filter((value) => value.id !== item.id);
  return selected.length < limit && !isHomeReferenceTooLarge(item) ? [...selected, item] : selected;
}

export async function commitHomeLibrarySelection(selected: HomeLibraryReference[], limit: number, signal: AbortSignal,
  onChoose: (files: File[]) => Promise<void>, load = loadHomeLibraryReferenceFile) {
  const unique = [...new Map(selected.map((item) => [item.id, item])).values()];
  if (!unique.length || unique.length > limit) throw new Error('Проверьте количество выбранных референсов.');
  // Download all originals before handing a batch to the composer, so a failed download adds nothing.
  const files = await Promise.all(unique.map((item) => load(item, signal)));
  if (!signal.aborted) await onChoose(files);
}
