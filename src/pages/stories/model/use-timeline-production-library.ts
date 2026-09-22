'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
export type TimelineLibraryAsset = { id: string; mediaKind: 'audio' | 'video' | 'image'; status: string; originalName: string; origin?: string; modelId?: string | null; createdAt?: string; thumbnailUrl?: string; video?: { durationSeconds: number; browserPlayable: boolean; audioTracks?: Array<{ index: number; isDefault?: boolean }> }; audio?: { durationSeconds: number } };
type AssetDto = TimelineLibraryAsset;
import { uploadWithProgress } from '@/shared/api/upload-with-progress';
import { awaitAssetUpload } from '@/shared/api/asset-upload-response';
import { storyRequest } from './story-api';

export function useTimelineProductionLibrary(workspaceId: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [assets, setAssets] = useState<AssetDto[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null), uploadLock = useRef(false);
  const [uploads, setUploads] = useState<Array<{ name: string; percent: number; phase: 'waiting' | 'uploading' | 'processing' | 'ready' | 'error'; error?: string }>>([]);
  const [uploadedBatch, setUploadedBatch] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(next?: string, signal?: AbortSignal) {
    const page = await storyRequest<{ items: AssetDto[]; nextCursor: string | null }>(`/api/assets?workspaceId=${workspaceId}&limit=100${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, { signal });
    if (!signal?.aborted) { setAssets((current) => next ? [...new Map([...current, ...page.items].map((asset) => [asset.id, asset])).values()] : page.items); setCursor(page.nextCursor); }
  }
  useEffect(() => {
    const abort = new AbortController(); lifetime.current = abort;
    void load(undefined, abort.signal).catch((caught) => { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось загрузить материалы.")); });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  async function more() { setBusy(true); try { await load(cursor ?? undefined); } catch (caught) { setError(String(caught)); } finally { setBusy(false); } }
  async function refresh() { setBusy(true); try { await load(undefined, lifetime.current?.signal); } catch (caught) { if (!lifetime.current?.signal.aborted) setError(String(caught)); } finally { if (!lifetime.current?.signal.aborted) setBusy(false); } }
  async function uploadMany(files: File[]) {
    if (uploadLock.current || lifetime.current?.signal.aborted || !files.length) return [];
    uploadLock.current = true; const signal = lifetime.current?.signal;
    setBusy(true); setError('');
    setUploads(files.map((file) => ({ name: file.name, percent: 0, phase: 'waiting' })));
    const result: AssetDto[] = [], failures: string[] = [];
    const progress = (index: number, patch: Partial<(typeof uploads)[number]>) => { if (!signal?.aborted) setUploads((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); };
    try {
      for (const [index, file] of files.entries()) {
        if (signal?.aborted) break;
        try {
          const kind = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name) ? 'video'
            : file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name) ? 'images'
            : file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name) ? 'audio' : null;
          if (!kind) throw new Error(tUi("Поддерживаются изображения, видео и аудио."));
          const form = new FormData(); form.set('file', file); form.set('workspaceId', workspaceId); form.set('origin', 'uploaded');
          progress(index, { phase: 'uploading' });
          const uploaded = await uploadWithProgress(`/api/assets/${kind}`, form, (percent) => progress(index, { percent, phase: percent === 100 ? 'processing' : 'uploading' }), signal);
          progress(index, { percent: 100, phase: 'processing' });
          const response = await awaitAssetUpload(uploaded, fetch, signal), data = await response.json();
          if (!response.ok) throw new Error(data.error?.message ?? tUi("Не удалось загрузить файл."));
          const asset = data.asset as AssetDto;
          if (signal?.aborted) break;
          result.push(asset); setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
          progress(index, { phase: 'ready' });
        } catch (caught) {
          if (signal?.aborted) break;
          const message = caught instanceof Error ? caught.message : tUi("Не удалось загрузить файл.");
          failures.push(`${file.name}: ${message}`); progress(index, { phase: 'error', error: message });
        }
      }
      if (!signal?.aborted) { setError(failures.join(' · ')); if (result.length) setUploadedBatch((value) => value + 1); }
      return result;
    } finally { uploadLock.current = false; if (!signal?.aborted) setBusy(false); }
  }
  async function upload(file: File) { return (await uploadMany([file]))[0] ?? null; }
  return { assets, cursor, busy, error, more, refresh, upload, uploadMany, uploads, uploadedBatch };
}
