import type { TimelineLibraryAsset } from './use-timeline-production-library';

/** IDs and source filenames stay intact; presentation hides machine-generated filenames. */
export function timelineAssetName(asset: TimelineLibraryAsset, locale = 'ru-RU', translate: (source: string) => string = (source) => source) {
  const name = asset.originalName;
  if (!/(?:[\da-f]{8}-[\da-f-]{27,}|[\da-f]{24,}|^generated[-_]|^image[-_]\d{10,}|^video[-_]\d{10,})/i.test(name)) return name;
  const kind = translate(asset.mediaKind === 'image' ? 'Изображение' : asset.mediaKind === 'video' ? 'Видео' : 'Аудио');
  const model = asset.modelId?.split('/').at(-1)?.replace(/[-_]/g, ' ');
  const date = asset.createdAt ? new Date(asset.createdAt) : null;
  const stamp = date && Number.isFinite(date.getTime()) ? date.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return [kind, model, stamp].filter(Boolean).join(' · ');
}
