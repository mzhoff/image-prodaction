import { isUuidV7 } from '@/shared/lib/id';
import { loadHomeLibraryReferenceFile, type HomeLibraryReference } from './home-library-reference-api';

export type HomeEditSelectionHandler = (files: File[], prompt: string) => Promise<void>;

export interface HomeResultImage extends HomeLibraryReference {
  width: number;
  height: number;
}

export async function readHomeResultImage(assetId: string, workspaceId: string, signal: AbortSignal): Promise<HomeResultImage> {
  if (!isUuidV7(assetId)) throw new Error('Изображение недоступно. Обновите статус результата.');
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
    cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  const body = await response.json().catch(() => null);
  const asset = body?.asset;
  if (!response.ok || asset?.id !== assetId || asset?.workspaceId !== workspaceId || asset?.status !== 'ready'
    || asset?.mediaKind !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(asset?.contentType)
    || !Number.isSafeInteger(asset?.width) || asset.width < 1 || !Number.isSafeInteger(asset?.height) || asset.height < 1
    || typeof asset.originalName !== 'string' || !Number.isSafeInteger(asset?.byteSize) || asset.byteSize < 1) {
    throw new Error('Изображение недоступно. Возможно, оно удалено. Обновите статус результата.');
  }
  return { id: asset.id, originalName: asset.originalName, contentType: asset.contentType,
    byteSize: asset.byteSize, width: asset.width, height: asset.height };
}

export async function readHomeResultReference(assetId: string, workspaceId: string, signal: AbortSignal) {
  return loadHomeLibraryReferenceFile(await readHomeResultImage(assetId, workspaceId, signal), signal);
}

export async function downloadHomeResult(assetId: string, workspaceId: string, signal: AbortSignal) {
  const asset = await readHomeResultImage(assetId, workspaceId, signal);
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/content`, {
    credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error('Не удалось скачать изображение. Попробуйте ещё раз.');
  const blob = await response.blob();
  if (!blob.size || blob.type.split(';')[0] !== asset.contentType) throw new Error('Не удалось скачать изображение. Попробуйте ещё раз.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = asset.originalName;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function createHomeMaskPrompt(instruction: string) {
  return `Измени исходное изображение по приложенной чёрно-белой маске. Белая область — место правки, чёрная — область, которую нужно сохранить. Сохрани композицию, героев и детали за пределами выделения.\n\nЧто изменить: ${instruction.trim()}`;
}
