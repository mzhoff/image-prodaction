'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ChatToolRendererContext } from '@prodactionpro/chat-ui';
import { LoaderCircle, Square } from '@prodactionpro/ui-core/icons';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
import { aiAccessErrorMessage } from '@/modules/provider-connections/core/ai-access-messages';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';
import { homeJobFailureMessage } from '@/modules/chat-assistant/contracts/home-generation-errors';
import { homeVideoFailureMessage } from '@/modules/chat-assistant/contracts/home-video-errors';
import { HomeResultMedia } from './home-result-media';
import { HomeResultVideo } from './home-result-video';
import type { HomeEditSelectionHandler } from '../api/home-result-media-api';

export function HomeGenerationConfirmation({ safePreview }: ChatToolRendererContext) {
  const tUi = useTranslations();
  if (safePreview?.submitAuthorized === true) return <div className="home-generation-submit-authorized" role="status">{tUi("Подготавливаю изображение…")}</div>;
  return <div className="home-generation-confirmation">
    <strong>{tUi("Создать изображение")}</strong>
    <p>{typeof safePreview?.prompt === 'string' ? safePreview.prompt : tUi("По вашему описанию и референсам")}</p>
    <small>{[safePreview?.model, safePreview?.aspectRatio, safePreview?.size].filter((value) => typeof value === 'string').join(' · ')}</small>
    <small>{tUi("Генерация использует баланс Workspace. Итоговая стоимость будет известна после выполнения.")}</small>
  </div>;
}

type JobState = {
  status: string;
  assetId?: string;
  error?: { code?: string; message?: string; retryable?: boolean };
};
const LABELS: Record<string, string> = {
  queued: 'В очереди', running: 'Создаю изображение…', succeeded: 'Изображение готово',
  failed: 'Не удалось создать изображение', canceled: 'Генерация отменена',
};

export function HomeGenerationResult({ safeResult, workspaceId, onUseReference, onEditSelection }: Pick<ChatToolRendererContext, 'safeResult'> & {
  workspaceId: string; onUseReference: (file: File) => Promise<void>;
  onEditSelection?: HomeEditSelectionHandler;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const ui_LABELS = useUiCatalog(LABELS, tUi);
  const accessGate = useAiAccessGate();
  const jobId = typeof safeResult?.jobId === 'string' ? safeResult.jobId : undefined;
  const video = safeResult?.mediaKind === 'video';
  const [job, setJob] = useState<JobState>({ status: 'queued' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const observed = useRef<{ id: string; status: string } | undefined>(undefined);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`, {
          cache: 'no-store', headers: { 'x-workspace-id': workspaceId }, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.job || body.job.workspaceId !== workspaceId) throw new Error('unavailable');
        if (controller.signal.aborted) return;
        // A newly failed job updates the UX hint. Historical failures must not
        // overwrite access that may already have been restored by a top-up.
        if (body.job.status === 'failed' && observed.current?.id === jobId && ['queued', 'running'].includes(observed.current.status)) accessGate.onError(body.job.error);
        observed.current = { id: jobId, status: body.job.status };
        setJob({ status: body.job.status, assetId: body.job.finalAssetId ?? undefined, error: body.job.error });
        setError('');
        if (['queued', 'running'].includes(body.job.status) || (body.job.status === 'failed' && body.job.error?.retryable)) timer = setTimeout(() => void poll(), 2500);
      } catch {
        if (!controller.signal.aborted) setError(tEffect("Не удалось проверить состояние. Обновите статус: новое задание не запустится."));
      }
    };
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt, jobId, workspaceId, accessGate]);

  if (!jobId) return null;
  const recovering = job.status === 'failed' && job.error?.retryable;
  const running = ['queued', 'running'].includes(job.status) || recovering;
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST', headers: { 'x-workspace-id': workspaceId },
      });
      if (!response.ok) throw new Error('unavailable');
      setAttempt((value) => value + 1);
    } catch { setError(tUi("Не удалось отменить задание. Проверьте его состояние.")); }
    finally { setBusy(false); }
  };
  return <div className="home-generation-result">
    <div className="home-generation-status" role="status">{running ? <LoaderCircle size={16} className="home-generation-spinner" /> : null}
      <strong>{recovering ? tUi("Восстанавливаю результат…") : video ? ({ ...ui_LABELS, running: tUi("Создаю видео…"), succeeded: tUi("Видео готово"), failed: tUi("Не удалось создать видео") }[job.status] ?? tUi("Проверяю состояние…")) : ui_LABELS[job.status] ?? tUi("Проверяю состояние…")}</strong></div>
    {job.status === 'succeeded' && job.assetId ? video ? <HomeResultVideo key={job.assetId} assetId={job.assetId} /> : <HomeResultMedia key={job.assetId} assetId={job.assetId}
      workspaceId={workspaceId} onUseReference={onUseReference} onEditSelection={onEditSelection} /> : null}
    {running ? <button type="button" disabled={busy} onClick={() => void cancel()}><Square size={13} />{tUi("Отменить")}</button> : null}
    {job.status === 'failed' ? aiAccessErrorMessage(job.error?.code)
      ? <button type="button" onClick={() => accessGate.onError(job.error)}>{tUi("Проверить AI-доступ")}</button>
      : <><p role={recovering ? 'status' : 'alert'}>{video ? homeVideoFailureMessage(job.error?.code ?? '', job.error?.retryable) : homeJobFailureMessage(job.error?.code, job.error?.retryable)}</p><small>{tUi("Задание:")}{' '} {jobId}</small></> : null}
    {error ? <div role="alert"><p>{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>{tUi("Обновить статус")}</button></div> : null}
  </div>;
}
