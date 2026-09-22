'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
import { reviewMontageSlots } from '@/modules/story-projects/core/timeline-track-editing';
import { montageSlotSchema, type MontageSlot } from '@/modules/story-projects/contracts/timeline-production';
import type { MontageJobRequest } from '@/modules/story-projects/contracts/timeline-production';
import type { MontageResult } from '@/modules/story-projects/contracts/timeline-production-result';
import { storyRequest } from './story-api';

export type MontageJobView = { job: { id: string; status: string; error?: { message: string; retryable: boolean } | null }; result: MontageResult | null; downloadUrl?: string | null };
export type ReviewedMontageJob = MontageJobView & { revision: number; parameters: string };

export function useMontageJob(timelineId: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [grid, setGrid] = useState<ReviewedMontageJob | null>(null), [proposal, setProposal] = useState<ReviewedMontageJob | null>(null), [render, setRender] = useState<ReviewedMontageJob | null>(null);
  const controller = useRef<AbortController | null>(null), activeId = useRef<string | null>(null), running = useRef(false);
  const key = `timeline-production:${timelineId}`;
  const [reviewed, setReviewed] = useState<{ id: string; slots: MontageSlot[] } | null>(null);
  const slots = reviewed?.id === grid?.job.id ? reviewed?.slots : grid?.result?.kind === 'grid' ? grid.result.slots : undefined;
  function editSlots(next: MontageSlot[]) {
    if (!grid || grid.result?.kind !== 'grid') return;
    const value = { id: grid.job.id, slots: reviewMontageSlots(grid.result.slots, next) };
    setReviewed(value); try { sessionStorage.setItem(`${key}:slots`, JSON.stringify(value)); } catch { /* Optional. */ }
  }
  const remember = (data: { id: string; revision: number; parameters: string }) => { try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* Storage may be disabled. */ } };
  function show(view: ReviewedMontageJob) {
    if (view.result?.kind === 'grid') {
      setGrid(view);
      try {
        sessionStorage.setItem(`${key}:grid`, JSON.stringify({ id: view.job.id, revision: view.revision, parameters: view.parameters }));
        const saved = JSON.parse(sessionStorage.getItem(`${key}:slots`) ?? 'null');
        if (saved?.id === view.job.id) setReviewed({ id: saved.id, slots: reviewMontageSlots(view.result.slots, montageSlotSchema.array().parse(saved.slots)) });
      } catch { /* Invalid local review is discarded. */ }
    }
    else if (view.result?.kind === 'proposal' || view.result?.kind === 'render') {
      if (view.result.kind === 'proposal') setProposal(view); else setRender(view);
      try { sessionStorage.setItem(`${key}:${view.result.kind}`, JSON.stringify({ id: view.job.id, revision: view.revision, parameters: view.parameters })); } catch { /* Optional. */ }
    }
  }
  async function poll(id: string, revision: number, parameters: string, signal: AbortSignal) {
    activeId.current = id;
    for (;;) {
      const view = await storyRequest<MontageJobView>(`/api/stories/timelines/${timelineId}/jobs/${id}`, { signal });
      signal.throwIfAborted();
      if (view.job.status === 'succeeded') { show({ ...view, revision, parameters }); setStatus(tUi("Готово")); return { ...view, revision, parameters }; }
      if (view.job.status === 'canceled' || (view.job.status === 'failed' && !view.job.error?.retryable)) throw new Error(view.job.error?.message ?? tUi("Обработка отменена."));
      setStatus(view.job.status === 'queued' ? tUi("В очереди…") : view.result?.kind === 'analysis' ? tUi("Описано сцен: {p1}…", { p1: view.result.analysis.sources.length }) : tUi("Обрабатываем…"));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    let previous: { id: string; revision: number; parameters: string } | null = null;
    try { previous = JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { /* No saved request. */ }
    if (previous && /^[0-9a-f-]{36}$/i.test(previous.id)) {
      running.current = true; setBusy(true);
      void (async () => {
        for (const kind of ['grid', 'proposal', 'render']) {
          let saved: { id: string; revision: number; parameters: string } | null = null;
          try { saved = JSON.parse(sessionStorage.getItem(`${key}:${kind}`) ?? 'null'); } catch { /* Optional. */ }
          if (saved && saved.id !== previous.id && /^[0-9a-f-]{36}$/i.test(saved.id)) {
            try { await poll(saved.id, saved.revision, saved.parameters, abort.signal); } catch { /* The active job remains recoverable. */ }
          }
        }
        await poll(previous.id, previous.revision, previous.parameters, abort.signal);
      })()
        .catch((caught) => { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось открыть задачу.")); })
        .finally(() => { if (!abort.signal.aborted) { running.current = false; setBusy(false); } });
    }
    return () => controller.current?.abort();
    // The poll owns this document's lifetime; it does not read mutable component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  async function run(request: MontageJobRequest, parameters: string) {
    if (running.current) return;
    running.current = true; activeId.current = null;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setStatus(tUi("Отправляем…"));
    try {
      const accepted = await storyRequest<{ job: { id: string } }>(`/api/stories/timelines/${timelineId}/jobs`, { method: 'POST', body: JSON.stringify(request), signal: abort.signal });
      remember({ id: accepted.job.id, revision: request.expectedRevision, parameters });
      return await poll(accepted.job.id, request.expectedRevision, parameters, abort.signal);
    } catch (caught) { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : tUi("Не удалось запустить обработку.")); }
    finally { if (!abort.signal.aborted) { running.current = false; setBusy(false); } }
  }
  async function cancel() {
    if (!activeId.current) return;
    try { await storyRequest(`/api/stories/timelines/${timelineId}/jobs/${activeId.current}`, { method: 'DELETE' }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось отменить.")); }
  }
  return { busy, status, error, grid, proposal, render, slots, editSlots, run, cancel };
}
