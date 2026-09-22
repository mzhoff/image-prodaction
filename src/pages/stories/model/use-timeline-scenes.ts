'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, useState } from 'react';
import { cancelTimelineJob, readTimelineJob, startTimelineJob, waitForTimelineJob, type TimelineJobResponse } from '@/features/graph-node/api/timeline-api';
import { createUuidV7 } from '@/shared/lib/id';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';

export function useTimelineScenes(timelineId: string, workspaceId: string) {
  const tUi = useTranslations();
  const [result, setResult] = useState<TimelineAnalysis | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const controller = useRef<AbortController | null>(null), jobId = useRef<string | null>(null), locked = useRef(false);
  const key = `timeline-scenes:${timelineId}`;
  async function follow(initial: TimelineJobResponse, signal: AbortSignal) {
    jobId.current = initial.job.id;
    const value = await waitForTimelineJob(initial, { signal, workspaceId, onUpdate: (view) => {
      const progress = view.progress?.analysis;
      setStatus(view.job.status === 'queued' ? tUi("Разбиение в очереди…") : progress ? tUi("Ищем склейки · {p1} сек.", { p1: (progress.processedMs / 1000).toFixed(0) }) : tUi("Ищем склейки…"));
    } });
    if ('version' in value) { setResult(value); setStatus(tUi("Найдено сцен: {p1}. Добавьте их на дорожку.", { p1: value.shots.length })); }
  }
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    let id: string | null = null; try { id = sessionStorage.getItem(key); } catch { /* Storage optional. */ }
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      locked.current = true; setBusy(true);
      void readTimelineJob(id, abort.signal).then((job) => follow(job, abort.signal)).catch((caught) => { if (!abort.signal.aborted) setError(String(caught)); })
        .finally(() => { if (!abort.signal.aborted) { locked.current = false; setBusy(false); } });
    }
    return () => controller.current?.abort();
    // A document owns the poll; unmount detaches without canceling accepted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, workspaceId]);
  async function analyze(assetId: string, threshold: number) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setResult(null);
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    try {
      const job = await startTimelineJob({ action: 'analyze', assetId, threshold }, { workspaceId, documentId: null }, createUuidV7(), abort.signal);
      try { sessionStorage.setItem(key, job.job.id); } catch { /* Storage optional. */ }
      await follow(job, abort.signal);
    } catch (caught) { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : tUi("Не удалось разделить видео.")); }
    finally { if (!abort.signal.aborted) { locked.current = false; setBusy(false); } }
  }
  function clear() { setResult(null); setStatus(''); try { sessionStorage.removeItem(key); } catch { /* Storage optional. */ } }
  async function cancel() { if (jobId.current) { try { await cancelTimelineJob(jobId.current); } catch (caught) { setError(String(caught)); } } }
  return { result, busy, error, status, analyze, clear, cancel };
}
