import { createZipBlob } from '@/shared/lib/zip-file';
import type { LibraryAssetItem } from '../model/types';

export function libraryActionTargets(items: LibraryAssetItem[], selectedIds: ReadonlySet<string>, clicked: LibraryAssetItem) {
  return selectedIds.has(clicked.id) ? items.filter((item) => selectedIds.has(item.id)) : [clicked];
}

export function libraryDownloadNames(items: LibraryAssetItem[]) {
  const used = new Set<string>();
  return items.map((item) => {
    const original = item.originalName.replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]/gu, '_').replace(/^\.+/, '').trim() || 'image';
    const dot = original.lastIndexOf('.');
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : '';
    let name = original;
    let suffix = 1;
    while (used.has(name.toLocaleLowerCase())) name = `${stem} (${++suffix})${extension}`;
    used.add(name.toLocaleLowerCase());
    return name;
  });
}

export async function prepareLibraryDownload(items: LibraryAssetItem[], signal: AbortSignal,
  progress: (done: number) => void, request: typeof fetch = fetch) {
  if (!items.length) throw new Error('Выберите файлы для скачивания.');
  const names = libraryDownloadNames(items);
  const entries = [];
  for (const [index, item] of items.entries()) {
    const response = await request(`/api/assets/${encodeURIComponent(item.id)}/content`, { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error(`Не удалось скачать «${item.originalName}». Попробуйте ещё раз.`);
    entries.push({ path: names[index], blob: await response.blob() });
    progress(index + 1);
  }
  return items.length === 1 ? { blob: entries[0].blob, name: names[0] }
    : { blob: await createZipBlob(entries), name: `Library-${new Date().toISOString().replace(/[:.]/g, '-')}.zip` };
}

export async function deleteLibraryItems(items: LibraryAssetItem[], signal: AbortSignal,
  progress: (done: number) => void, request: typeof fetch = fetch) {
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const item of items) {
    if (signal.aborted) break;
    try {
      const response = await request(`/api/assets/${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'same-origin', signal });
      if (!response.ok) throw new Error('Delete failed');
      deleted.push(item.id);
    } catch { failed.push(item.id); }
    progress(deleted.length + failed.length);
  }
  return { deleted, failed };
}
