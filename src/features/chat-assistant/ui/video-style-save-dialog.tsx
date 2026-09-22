'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useState } from 'react';
import { ImagePlus } from '@prodactionpro/ui-core/icons';
import { createUuidV7 } from '@/shared/lib/id';
import type { VideoStyleSettings } from '@/shared/media/home-video-direction';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS } from '@/shared/media/video-cinematic-catalog';
import type { VideoStylePreset } from '@/modules/video-style-presets/contracts/video-style-preset';
import { saveVideoStyle } from '../api/video-style-presets-api';
import { VideoStyleCoverPicker } from './video-style-cover-picker';
import { VideoStyleDialog } from './video-style-dialog';
import styles from './video-style-library.module.css';

export function VideoStyleSaveDialog({ workspaceId, value, coverAssetId, preset, onSaved, onClose, editable = false }: {
  workspaceId: string; value: VideoStyleSettings; coverAssetId?: string; preset?: VideoStylePreset;
  onSaved: (preset: VideoStylePreset) => void; onClose: () => void; editable?: boolean;
}) {
  const tUi = useTranslations();
  const ui_VIDEO_LOOK_OPTIONS = useUiCatalog(VIDEO_LOOK_OPTIONS, tUi);
  const ui_VIDEO_GRAIN_OPTIONS = useUiCatalog(VIDEO_GRAIN_OPTIONS, tUi);
  const [id] = useState(() => preset?.id ?? createUuidV7());
  const [name, setName] = useState(preset?.name ?? '');
  const [style, setStyle] = useState(value);
  const [cover, setCover] = useState(coverAssetId ?? preset?.coverAssetId ?? null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try { onSaved(await saveVideoStyle(workspaceId, id, { name, style, coverAssetId: cover, expectedRevision: preset?.revision ?? 0 })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось сохранить стиль. Повторите попытку.")); }
    finally { setBusy(false); }
  };
  return <VideoStyleDialog title={preset ? tUi("Изменить стиль") : tUi("Сохранить стиль")} onClose={onClose} busy={busy}>
    {picking ? <VideoStyleCoverPicker workspaceId={workspaceId} onCancel={() => setPicking(false)}
      onChoose={(assetId) => { setCover(assetId); setPicking(false); }} /> : <div className={styles.editor}>
      <label>{tUi("Название")}<input className={styles.input} autoFocus value={name} maxLength={100} disabled={busy}
        placeholder={tUi("Например, домашнее видео 2000-х")} onChange={(event) => setName(event.target.value)} /></label>
      {editable ? <>
        <label>{tUi("Визуальный стиль")}<select className={styles.input} value={style.look} disabled={busy}
          onChange={(event) => setStyle({ ...style, look: event.target.value as VideoStyleSettings['look'] })}>
          {ui_VIDEO_LOOK_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <label>{tUi("Зерно")}<select className={styles.input} value={style.grain} disabled={busy}
          onChange={(event) => setStyle({ ...style, grain: event.target.value as VideoStyleSettings['grain'] })}>
          {ui_VIDEO_GRAIN_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <label>{tUi("Описание")}<textarea className={styles.input} rows={4} value={style.prompt} maxLength={2000} disabled={busy}
          placeholder={tUi("Цвет, фактура, эпоха, настроение…")} onChange={(event) => setStyle({ ...style, prompt: event.target.value })} /></label>
      </> : <p className={styles.hint}>{tUi("Сохранятся выбранный стиль, зерно и ваше описание.")}</p>}
      <div className={styles.coverRow}><button type="button" className={styles.cover} disabled={busy} onClick={() => setPicking(true)}
        aria-label={tUi("Выбрать обложку стиля из Library")}>{cover ? <img src={`/api/assets/${cover}/content?variant=thumbnail`} alt={tUi("Обложка стиля")} draggable={false} /> : <ImagePlus size={28} />}</button>
        <div><button type="button" className={styles.button} disabled={busy} onClick={() => setPicking(true)}>{tUi("Обложка из Library")}</button>
          {cover ? <button type="button" className={styles.button} disabled={busy} onClick={() => setCover(null)}>{tUi("Убрать обложку")}</button> : null}
          <p className={styles.hint}>{tUi("Обложка помогает узнать стиль. Она не добавляется в референсы генерации.")}</p></div></div>
      {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      <footer className={styles.footer}><button type="button" className={styles.button} disabled={busy} onClick={onClose}>{tUi("Отмена")}</button>
        <button type="button" className={styles.primary} disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? tUi("Сохраняем…") : tUi("Сохранить")}</button></footer>
    </div>}
  </VideoStyleDialog>;
}
