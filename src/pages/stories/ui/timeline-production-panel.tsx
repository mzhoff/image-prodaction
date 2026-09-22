'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { timelineVideoDuration } from '@/modules/story-projects/core/timeline-video';
import { useEffect, useState } from 'react';
import type { TimelineDocument, TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { timelineProductionSchema } from '@/modules/story-projects/contracts/timeline-production';
import { DEFAULT_TIMELINE_MODEL, TIMELINE_MODEL_OPTIONS } from '@/shared/api/timeline-models';
import { createUuidV7 } from '@/shared/lib/id';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { useMontageJob } from '../model/use-montage-job';
import type { useTimelineProductionLibrary } from '../model/use-timeline-production-library';
import { storyRequest } from '../model/story-api';
import styles from './timeline-production-panel.module.css';

export function TimelineProductionPanel({ timeline, dirty, disabled, commit, accept, edit, library, jobs }: {
  timeline: TimelineDocument; dirty: boolean; disabled: boolean;
  library: ReturnType<typeof useTimelineProductionLibrary>; jobs: ReturnType<typeof useMontageJob>;
  commit(snapshot: TimelineSnapshot): Promise<TimelineDocument>; accept(timeline: TimelineDocument): void; edit(timeline: TimelineDocument): void;
}) {
  const tUi = useTranslations();
  const production = timeline.snapshot.production;
  const [restored] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`timeline-settings:${timeline.id}`) ?? 'null');
      if (saved?.revision !== timeline.revision || typeof saved.parameters !== 'string') return null;
      const value = JSON.parse(saved.parameters);
      return typeof value.musicId === 'string' && Number.isFinite(value.sourceIn) && Number.isFinite(value.offset) && typeof value.bpm === 'string' ? value as { musicId: string; sourceIn: number; offset: number; bpm: string } : null;
    } catch { return null; }
  });
  const [brief, setBrief] = useState(production?.brief ?? tUi("Собрать проморолик: вступление, развитие, кульминация и финал."));
  const [seconds, setSeconds] = useState((production?.targetDurationMs ?? 30_000) / 1000);
  const [pacing, setPacing] = useState<NonNullable<TimelineSnapshot['production']>['pacing']>(production?.pacing ?? 'mixed');
  const [sources, setSources] = useState<string[]>(production?.sourceAssetIds ?? [...new Set(timeline.snapshot.clips.filter((clip) => clip.kind === 'video').map((clip) => clip.assetId))]);
  const [musicId, setMusicId] = useState(restored?.musicId ?? timeline.snapshot.audioClips?.find((clip) => clip.role === 'music')?.assetId ?? '');
  const [sourceIn, setSourceIn] = useState(restored?.sourceIn ?? 0), [offset, setOffset] = useState(restored?.offset ?? 0), [bpm, setBpm] = useState(restored?.bpm ?? '');
  const [model, setModel] = useState<string>(DEFAULT_TIMELINE_MODEL), [error, setError] = useState(''), [acting, setActing] = useState(false);
  const busy = disabled || acting || jobs.busy || library.busy;
  const parameters = JSON.stringify({ brief, seconds, pacing, sources, musicId, sourceIn, offset, bpm });
  const grid = jobs.grid?.result?.kind === 'grid' ? jobs.grid.result : null;
  const gridCurrent = Boolean(grid && jobs.grid?.parameters === parameters && jobs.grid.revision === timeline.revision && !dirty);
  useEffect(() => {
    try { sessionStorage.setItem(`timeline-settings:${timeline.id}`, JSON.stringify({ revision: timeline.revision, parameters })); } catch { /* The montage itself has a separate durable local journal. */ }
  }, [parameters, timeline.id, timeline.revision]);
  function updateProduction(patch: Partial<NonNullable<TimelineSnapshot['production']>>) {
    const result = timelineProductionSchema.safeParse({ purpose: 'promo', brief, targetDurationMs: seconds * 1000, pacing, sourceAssetIds: sources, ...patch });
    if (result.success) edit({ ...timeline, snapshot: { ...timeline.snapshot, production: result.data } });
  }
  const proposal = jobs.proposal?.result?.kind === 'proposal' ? jobs.proposal.result : null;
  async function act(work: () => Promise<unknown>) {
    setError(''); setActing(true);
    try { await work(); } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось выполнить действие.")); }
    finally { setActing(false); }
  }
  async function prepare() {
    await act(async () => {
      if (!musicId) throw new Error(tUi("Выберите музыку."));
      if (bpm && (!Number.isFinite(Number(bpm)) || Number(bpm) < 40 || Number(bpm) > 240)) throw new Error(tUi("BPM — от 40 до 240."));
      const next = { ...timeline.snapshot, production: timelineProductionSchema.parse({ purpose: 'promo', brief, targetDurationMs: Math.round(seconds * 1000), pacing, sourceAssetIds: sources }) };
      const saved = !dirty && JSON.stringify(next) === JSON.stringify(timeline.snapshot) ? timeline : await commit(next);
      try { sessionStorage.setItem(`timeline-settings:${timeline.id}`, JSON.stringify({ revision: saved.revision, parameters })); } catch { /* Settings remain usable without storage. */ }
      const reuse = bpm && grid?.music.assetId === musicId && grid.music.sourceInMs === Math.round(sourceIn * 1000) && grid.music.durationMs === next.production.targetDurationMs;
      await jobs.run({ action: 'rhythm', expectedRevision: saved.revision, idempotencyKey: createUuidV7(), musicAssetId: musicId,
        musicSourceInMs: Math.round(sourceIn * 1000), beatOffsetMs: Math.round(offset * 1000), ...(bpm ? { bpm: Number(bpm) } : {}),
        ...(reuse && jobs.grid ? { previousGridJobId: jobs.grid.job.id } : {}) }, parameters);
    });
  }
  async function autoEdit() {
    if (!gridCurrent || !jobs.grid || !sources.length) return;
    await act(() => jobs.run({ action: 'plan', expectedRevision: timeline.revision, idempotencyKey: createUuidV7(), model, gridJobId: jobs.grid!.job.id, slots: jobs.slots,
      ...(jobs.proposal?.result?.kind === 'proposal' && jobs.proposal.result.analysis?.completedAssetIds.length === sources.length && sources.every((id) => jobs.proposal?.result?.kind === 'proposal' && jobs.proposal.result.analysis?.completedAssetIds.includes(id)) ? { analysisJobId: jobs.proposal.job.id } : {}) }, parameters + JSON.stringify(jobs.slots)));
  }
  const proposalCurrent = jobs.proposal?.parameters === parameters + JSON.stringify(jobs.slots);
  return <section className={styles.panel} aria-label={tUi("Музыка и автомонтаж")}><h2>{tUi("Музыка и автомонтаж")}</h2><div className={styles.content}>
    <p>{tUi("Сначала подготовьте и проверьте ячейки. Затем запустите AI: он опишет сцены и предложит монтаж. Исходная музыка не ускоряется.")}</p>
    <fieldset disabled={busy} className={styles.fields}>
      <label className={styles.wide}>{tUi("Задача ролика")}<textarea value={brief} maxLength={6000} onChange={(event) => { setBrief(event.target.value); updateProduction({ brief: event.target.value }); }} /></label>
      <label>{tUi("Длительность, сек.")}<input type="number" min={5} max={180} value={seconds} onChange={(event) => { setSeconds(Number(event.target.value)); updateProduction({ targetDurationMs: Number(event.target.value) * 1000 }); }} /></label>
      <BrandSelect label={tUi("Характер монтажа")} value={pacing} onChange={(value) => { setPacing(value as typeof pacing); updateProduction({ pacing: value as typeof pacing }); }} options={[
        { value: 'calm', label: tUi("Спокойный · около 4–6 сек.") }, { value: 'normal', label: tUi("Обычный · около 2–4 сек.") },
        { value: 'dynamic', label: tUi("Динамичный · около 0,5–2 сек.") }, { value: 'mixed', label: tUi("Смешанный · по энергии музыки") }]} />
      <BrandSelect label={tUi("Музыка из библиотеки")} value={musicId} onChange={setMusicId} options={library.assets.filter((asset) => asset.mediaKind === 'audio' && asset.status === 'ready').map((asset) => ({ value: asset.id, label: asset.originalName }))} />
      <label>{tUi("Начало в треке, сек.")}<input type="number" min={0} max={1800} step={0.1} value={sourceIn} onChange={(event) => setSourceIn(Number(event.target.value))} /></label>
      <label>{tUi("BPM · пусто = определить")}<input type="number" min={40} max={240} step={0.1} value={bpm} placeholder={grid?.music.bpm?.toFixed(1) ?? tUi("Авто")} onChange={(event) => setBpm(event.target.value)} /></label>
      <label>{tUi("Первый удар от начала фрагмента, сек.")}<input type="number" min={0} max={6} step={0.01} value={offset} onChange={(event) => setOffset(Number(event.target.value))} /></label>
      <div className={styles.actions}><button type="button" onClick={() => setBpm(String(Math.max(40, Number(bpm || grid?.music.bpm || 120) / 2)))}>BPM ÷ 2</button><button type="button" onClick={() => setBpm(String(Math.min(240, Number(bpm || grid?.music.bpm || 120) * 2)))}>BPM × 2</button><button type="button" onClick={() => setBpm('')}>{tUi("Определять автоматически")}</button></div>
      <div className={styles.wide}><strong>{tUi("Видео для монтажа ·")}{' '} {sources.length}/20</strong><div className={styles.sources}>
        {library.assets.filter((asset) => asset.mediaKind === 'video' && asset.status === 'ready').map((asset) => <label key={asset.id}><input type="checkbox" checked={sources.includes(asset.id)} disabled={!sources.includes(asset.id) && sources.length >= 20}
          onChange={(event) => { const next = event.target.checked ? [...sources, asset.id] : sources.filter((id) => id !== asset.id); setSources(next); updateProduction({ sourceAssetIds: next }); }} />{asset.originalName}</label>)}
      </div><label>{tUi("Загрузить видео или музыку")}<input type="file" accept="video/mp4,video/quicktime,video/webm,audio/*" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        const asset = await library.upload(file); if (!asset) return;
        if (asset.mediaKind === 'audio') setMusicId(asset.id); else setSources((current) => [...new Set([...current, asset.id])].slice(0, 20));
      }} /></label>{library.cursor ? <button type="button" onClick={library.more}>{tUi("Ещё материалы")}</button> : null}</div>
      <button type="button" className="story-primary" onClick={prepare}>{tUi("1. Пересчитать ритм и ячейки")}</button>
    </fieldset>
    {library.busy ? <p role="status">{tUi("Загружаем и проверяем файл. После приёма обработка продолжится в фоне.")}</p> : null}
    {musicId ? <audio controls preload="metadata" src={`/api/assets/${musicId}/content`} aria-label={tUi("Прослушать выбранную музыку")} /> : null}
    <button type="button" disabled={busy || !musicId || (timeline.snapshot.audioClips?.length ?? 0) >= 32} onClick={() => {
      const asset = library.assets.find((item) => item.id === musicId);
      const durationMs = Math.min(timelineVideoDuration(timeline.snapshot) || seconds * 1000, (asset?.audio?.durationSeconds ?? 0) * 1000 - sourceIn * 1000);
      if (durationMs < 100) { setError(tUi("Выберите доступный фрагмент аудио.")); return; }
      edit({ ...timeline, snapshot: { ...timeline.snapshot, audioClips: [...(timeline.snapshot.audioClips ?? []), { id: createUuidV7(), assetId: musicId, startMs: 0, sourceInMs: Math.round(sourceIn * 1000), durationMs: Math.floor(durationMs), gain: 1, role: 'music' }] } });
    }}>{tUi("Добавить выбранное аудио на дорожку")}</button>
    {grid ? <section aria-label={tUi("Предложенная сетка монтажа")}><p>{grid.slots.length}  {' '}{tUi("ячеек ·")}{' '} {grid.music.bpm?.toFixed(1)} BPM. {gridCurrent ? tUi("Проверьте ритм. AI может объединить до трёх соседних ячеек, чтобы сохранить важное действие.") : tUi("Параметры или документ изменились — пересчитайте ячейки.")}</p>
      {grid.slots.length > 100 ? <p role="alert">{tUi("Больше 100 ячеек: сократите ролик или выберите более спокойный монтаж.")}</p> : null}<p>{tUi("Ячейки показаны на дорожке «Ритм». Потяните границу или выберите ячейку для точной настройки.")}</p></section> : null}
    <div className={styles.actions}><BrandSelect disabled={busy} label={tUi("Модель автомонтажа")} value={model} onChange={setModel} options={[...TIMELINE_MODEL_OPTIONS]} /><button type="button" className="story-primary" disabled={busy || !gridCurrent || !sources.length || (grid?.slots.length ?? 0) > 100} onClick={autoEdit}>{tUi("2. Запустить AI-автомонтаж")}</button><span>{tUi("Платный анализ сцен и подбор кадров")}</span></div>
    {proposal ? <section><p>{tUi("Предложение:")}{' '} {proposal.snapshot.clips.length}  {' '}{tUi("клипов. Текущий монтаж изменится только после применения.")}</p><details><summary>{tUi("Почему выбраны эти фрагменты")}</summary><ol>{proposal.reasons.map((item) => <li key={item.slotId}>{item.reason}</li>)}</ol></details>
      <button type="button" disabled={busy || dirty || !proposalCurrent || jobs.proposal?.revision !== timeline.revision} onClick={() => act(async () => {
        const result = await storyRequest<{ timeline: TimelineDocument }>(`/api/stories/timelines/${timeline.id}/jobs/${jobs.proposal!.job.id}/apply`, { method: 'POST', body: JSON.stringify({ expectedRevision: timeline.revision }) }); accept(result.timeline);
      })}>{tUi("Применить предложение")}</button></section> : null}
    {jobs.busy ? <button type="button" onClick={jobs.cancel}>{tUi("Остановить обработку")}</button> : null}<p role="status">{jobs.status}</p>
    {error || jobs.error || library.error ? <p role="alert" className="story-error">{error || jobs.error || library.error}</p> : null}
  </div></section>;
}
