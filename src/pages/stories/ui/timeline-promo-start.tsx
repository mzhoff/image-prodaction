'use client';
import { useRef, useState } from 'react';
import { AudioLines, Check, Film, LoaderCircle, Upload } from '@prodactionpro/ui-core/icons';
import type { TimelineDocument, TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import { createUuidV7 } from '@/shared/lib/id';
import { useTranslations } from '@/shared/i18n/use-translations';
import { BrandSelect } from '@/shared/ui/brand-select';
import { promoParameters, timelineWithMusic } from '../model/timeline-promo-start';
import type { useTimelineProductionLibrary, TimelineLibraryAsset } from '../model/use-timeline-production-library';
import type { useMontageJob } from '../model/use-montage-job';
import { storyRequest } from '../model/story-api';
import styles from './timeline-promo-start.module.css';

export function TimelinePromoStart({ timeline, library, jobs, commit, accept, disabled }: {
  timeline: TimelineDocument; library: ReturnType<typeof useTimelineProductionLibrary>; jobs: ReturnType<typeof useMontageJob>;
  commit(snapshot: TimelineSnapshot): Promise<TimelineDocument>; accept(timeline: TimelineDocument): void; disabled: boolean;
}) {
  const t = useTranslations(), input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [choosing, setChoosing] = useState(false);
  const music = timeline.snapshot.audioClips?.find((clip) => clip.role === 'music');
  const grid = jobs.grid?.result?.kind === 'grid' && jobs.grid.result.music.assetId === music?.assetId ? jobs.grid : null;
  const sources = timeline.snapshot.production?.sourceAssetIds ?? [];
  const busy = disabled || working || library.busy || jobs.busy;
  async function act(work: () => Promise<unknown>) {
    if (lock.current || busy) return;
    lock.current = true; setWorking(true); setError('');
    try { await work(); } catch (caught) { setError(caught instanceof Error ? caught.message : t('Не удалось подготовить монтаж.')); }
    finally { lock.current = false; setWorking(false); }
  }
  async function rhythm(document: TimelineDocument, musicId: string) {
    const parameters = promoParameters(document.snapshot, musicId);
    try { sessionStorage.setItem(`timeline-settings:${document.id}`, JSON.stringify({ revision: document.revision, parameters })); } catch { /* Optional UI preferences. */ }
    return jobs.run({ action: 'rhythm', expectedRevision: document.revision, idempotencyKey: createUuidV7(), musicAssetId: musicId, musicSourceInMs: 0, beatOffsetMs: 0,
      ...(grid?.result?.kind === 'grid' && grid.result.music.durationMs === document.snapshot.production?.targetDurationMs ? { previousGridJobId: grid.job.id } : {}) }, parameters);
  }
  async function prepare(asset: TimelineLibraryAsset) {
    const saved = await commit(timelineWithMusic(timeline.snapshot, asset));
    await rhythm(saved, asset.id);
  }
  async function upload(files: File[]) {
    await act(async () => {
      const filesToUpload = music && grid ? files.filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name)).slice(0, 20 - sources.length) : files.filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)).slice(0, 1);
      if (!filesToUpload.length) throw new Error(t('Выберите файл подходящего типа.'));
      const accepted = await library.uploadMany(filesToUpload);
      if (!accepted.length) return;
      if (!grid) await prepare(accepted[0]);
      else {
        await commit({ ...timeline.snapshot, production: { ...timeline.snapshot.production!, sourceAssetIds: [...new Set([...sources, ...accepted.filter((asset) => asset.mediaKind === 'video').map((asset) => asset.id)])].slice(0, 20) } });
        setChoosing(true);
      }
    });
  }
  const proposal = jobs.proposal?.result?.kind === 'proposal' ? jobs.proposal : null;
  return <section className={styles.start} aria-label={t('Промо на основе трека')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length) void upload(Array.from(event.dataTransfer.files)); }}>
    <span className={styles.icon}>{grid ? <Film size={30} /> : <AudioLines size={30} />}</span>
    <h2>{grid ? t('Теперь добавьте видео') : t('Начнём с музыки')}</h2>
    <p>{grid ? t('Ячейки уже на дорожке. Выберите материалы, из которых соберём ролик.') : t('Загрузите трек — подберём ритм и подготовим ячейки для кадров.')}</p>
    <input ref={input} className={styles.file} type="file" multiple={Boolean(grid)} accept={grid ? 'video/mp4,video/quicktime,video/webm' : 'audio/*'} aria-label={grid ? t('Загрузить видео для ролика') : t('Загрузить трек')} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files); }} />
    {busy ? <div role="status" aria-live="polite" className={styles.progress}><LoaderCircle className="home-generation-spinner" size={22} /><strong>{library.busy ? t('Загружаем и проверяем файлы…') : jobs.busy ? jobs.status || t('Анализируем ритм…') : t('Подготавливаем монтаж…')}</strong>
      {library.uploads.filter((item) => item.phase !== 'ready').map((item) => <div key={item.name}><span>{item.name}</span>{item.phase === 'uploading' ? <progress value={item.percent} max={100} /> : null}</div>)}
    </div> : <button className={styles.drop} type="button" disabled={grid ? sources.length >= 20 : false} onClick={() => input.current?.click()}><Upload size={22} /><strong>{grid ? t('Загрузить видео') : t('Выбрать трек')}</strong><small>{grid ? t('или перетащите файлы сюда') : t('или перетащите файл сюда · до 3 минут в ролике')}</small></button>}
    {!grid ? <BrandSelect label={t('Музыка из библиотеки')} value={music?.assetId ?? ''} disabled={busy} options={library.assets.filter((asset) => asset.mediaKind === 'audio' && asset.status === 'ready').map((asset) => ({ value: asset.id, label: asset.originalName }))} onChange={(id) => { const asset = library.assets.find((item) => item.id === id); if (asset) void act(() => prepare(asset)); }} />
      : <><button type="button" disabled={busy} className={styles.secondary} onClick={() => setChoosing(!choosing)}>{t('Выбрать из библиотеки')} · {sources.length}/20</button>
      {choosing ? <div className={styles.assets} aria-label={t('Видео для ролика')}>{library.assets.filter((asset) => asset.mediaKind === 'video' && asset.status === 'ready').map((asset) => <button type="button" key={asset.id} disabled={busy || (!sources.includes(asset.id) && sources.length >= 20)} aria-label={asset.originalName} aria-pressed={sources.includes(asset.id)} onClick={() => void act(() => commit({ ...timeline.snapshot, production: { ...timeline.snapshot.production!, sourceAssetIds: sources.includes(asset.id) ? sources.filter((id) => id !== asset.id) : [...sources, asset.id] } }))}>
        {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <Film size={24} />}<small>{asset.originalName}</small>{sources.includes(asset.id) ? <Check className={styles.check} size={18} /> : null}</button>)}</div> : null}
      {sources.length ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(async () => {
        const saved = await commit(timeline.snapshot);
        const current = grid.revision === saved.revision ? grid : await rhythm(saved, music!.assetId);
        if (current?.result?.kind !== 'grid') return;
        await jobs.run({ action: 'plan', expectedRevision: saved.revision, idempotencyKey: createUuidV7(), model: DEFAULT_TIMELINE_MODEL, gridJobId: current.job.id,
          ...(current.job.id === grid.job.id ? { slots: jobs.slots } : {}) }, promoParameters(saved.snapshot, music!.assetId));
      })}>{t('Собрать с AI')}</button> : null}</>}
    {library.cursor ? <button className={styles.secondary} type="button" disabled={busy} onClick={library.more}>{t('Ещё материалы из библиотеки')}</button> : null}
    {music && !grid && !busy ? <button type="button" className={styles.secondary} onClick={() => void act(async () => rhythm(await commit(timeline.snapshot), music.assetId))}>{t('Повторить анализ ритма')}</button> : null}
    {proposal ? <button className={styles.primary} disabled={busy || proposal.revision !== timeline.revision} onClick={() => void act(async () => { const result = await storyRequest<{ timeline: TimelineDocument }>(`/api/stories/timelines/${timeline.id}/jobs/${proposal.job.id}/apply`, { method: 'POST', body: JSON.stringify({ expectedRevision: timeline.revision }) }); accept(result.timeline); })}>{t('Применить монтаж')}</button> : null}
    {error || jobs.error || library.error ? <p role="alert">{error || jobs.error || library.error}</p> : null}
    {jobs.busy ? <button type="button" className={styles.secondary} onClick={jobs.cancel}>{t('Остановить обработку')}</button> : null}
  </section>;
}
