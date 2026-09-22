'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { prepareTimelineClip } from '../api/timeline-api';

export function useTimelineClipDownload(workspaceId: string, assetId: string, startMs: number, endMs: number) {
  const tUi = useTranslations();
  const pending = useRef<AbortController | null>(null);
  const key = `${workspaceId}:${assetId}:${startMs}:${endMs}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [workspaceId, assetId, startMs, endMs]);
  const download = async () => {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(key); setError(null);
    try {
      const asset = await prepareTimelineClip(workspaceId, assetId, startMs, endMs, controller.signal);
      if (pending.current !== controller || controller.signal.aborted) return;
      const link = document.createElement('a');
      link.href = getRemoteAssetContentUrl(asset.id);
      link.download = asset.name || `shot-${startMs}-${endMs}.mp4`;
      document.body.append(link); link.click(); link.remove();
    } catch {
      if (pending.current === controller && !controller.signal.aborted) setError({ key, message: tUi("Не удалось подготовить фрагмент для скачивания. Попробуйте ещё раз.") });
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  };
  return { download, busy: busy === key, error: error?.key === key ? error.message : '' };
}
