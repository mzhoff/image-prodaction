import { isUuidV7 } from '@/shared/lib/id';

export interface HomeLibraryReference {
  id: string;
  originalName: string;
  contentType: string;
  byteSize: number;
}
interface LibraryPage { items: unknown[]; nextCursor?: string | null }
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

export async function loadHomeLibraryReferences(workspaceId: string, query: string, signal: AbortSignal, cursor?: string | null) {
  const params = new URLSearchParams({ workspaceId, mediaKind: 'image', limit: '48' });
  if (query.trim()) params.set('search', query.trim());
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/assets?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error' });
  if (!response.ok) throw new Error('Не удалось загрузить Library. Повторите попытку.');
  const page = await response.json() as LibraryPage;
  if (!Array.isArray(page.items)) throw new Error('Не удалось загрузить Library. Повторите попытку.');
  return { items: page.items.filter((item): item is HomeLibraryReference => {
    if (!item || typeof item !== 'object') return false;
    const asset = item as Record<string, unknown>;
    return isUuidV7(asset.id) && asset.workspaceId === workspaceId && asset.status === 'ready'
      && asset.mediaKind === 'image' && typeof asset.originalName === 'string'
      && typeof asset.contentType === 'string' && IMAGE_TYPES.has(asset.contentType)
      && typeof asset.byteSize === 'number';
  }), nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null };
}

export function isHomeReferenceTooLarge(item: HomeLibraryReference) {
  return item.byteSize > MAX_REFERENCE_BYTES;
}

export async function loadHomeLibraryReferenceFile(item: HomeLibraryReference, signal: AbortSignal) {
  if (!isUuidV7(item.id) || !IMAGE_TYPES.has(item.contentType)) throw new Error('Выберите другое изображение.');
  if (isHomeReferenceTooLarge(item)) throw new Error('Для референса нужно изображение до 8 МБ. Загрузите уменьшенную копию.');
  const response = await fetch(`/api/assets/${encodeURIComponent(item.id)}/content`, {
    cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), redirect: 'error',
  });
  if (!response.ok || !response.body) throw new Error('Изображение недоступно. Обновите Library или выберите другой файл.');
  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim() ?? '';
  if (!IMAGE_TYPES.has(contentType)) throw new Error('Этот формат нельзя использовать как референс. Выберите PNG, JPEG или WebP.');
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_REFERENCE_BYTES) throw new Error('Для референса нужно изображение до 8 МБ. Загрузите уменьшенную копию.');
      chunks.push(Uint8Array.from(chunk.value).buffer);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  if (!size) throw new Error('Изображение оказалось пустым. Выберите другой файл.');
  return new File(chunks, item.originalName, { type: contentType });
}
