'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useId, useState } from 'react';
import { SlidersHorizontal, ChevronUp, ChevronDown } from '@prodactionpro/ui-core/icons';
import { DEFAULT_VIDEO_DIRECTION, type VideoDirectionSettings } from '@/shared/media/home-video-direction';
import type { VideoCameraSettings } from '@/shared/media/home-video-intent';
import type { HomeAttachments } from '../model/use-home-image-submit';
import type { useHomeVideoMaterials } from '../model/use-home-video-materials';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import { initialVideoDirection, videoLayerConfigured, VIDEO_DIRECTION_LAYERS, type VideoDirectionLayer } from '../model/video-direction-editor';
import { HomeVideoMaterials } from './home-video-materials';
import { VideoDirectionDialog, VIDEO_LAYER_ICONS } from './video-direction-dialog';
import { VideoDirectionDialogShell } from './video-direction-dialog-shell';
import trigger from './home-material-trigger.module.css';
import styles from './video-direction.module.css';

export function useHomeVideoSettings({ workspaceId, attachments, materials, camera, disabled, onReset }: {
  workspaceId: string; attachments: HomeAttachments; materials: ReturnType<typeof useHomeVideoMaterials>;
  camera: VideoCameraSettings; disabled: boolean; onReset: () => void;
}) {
  const tUi = useTranslations();
  const trayId = useId();
  const [expanded, setExpanded] = useState(false);
  const [direction, setDirection] = useState<VideoDirectionSettings>(() => initialVideoDirection(camera));
  const [subjects, setSubjects] = useState<HomeSubjectChoice[]>([]);
  const [covers, setCovers] = useState<Partial<Record<VideoDirectionLayer, string>>>({});
  const [layer, setLayer] = useState<VideoDirectionLayer | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const locked = disabled || resetting;
  const count = VIDEO_DIRECTION_LAYERS.filter((item) => videoLayerConfigured(direction, item.id) || covers[item.id]).length;
  const reset = async () => {
    if (locked || attachments.isUploading) return;
    setResetting(true); setResetError('');
    try {
      await attachments.clear();
      materials.reset();
      setDirection(structuredClone(DEFAULT_VIDEO_DIRECTION)); setSubjects([]); setCovers({});
      onReset(); setConfirmReset(false);
    } catch { setResetError(tUi("Не удалось убрать все вложения. Проверьте подключение и повторите сброс.")); }
    finally { setResetting(false); }
  };
  return { direction, subjects, resetting,
    toggle: <button type="button" className={`${trigger.trigger} home-material-trigger`} aria-label={tUi("Кадры и настройки сцены")}
      aria-expanded={expanded} aria-controls={trayId} data-selected={expanded || count > 0 || attachments.items.length > 0}
      disabled={locked} onClick={() => setExpanded((value) => !value)}>
      <span className={trigger.icon}><SlidersHorizontal /></span>
      <small className={`${trigger.count} ${styles.triggerState}`}>{count || attachments.items.length ? <span aria-label={tUi("Есть выбранные настройки")}>•</span> : null}{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</small>
      <strong>{tUi("Настройки")}</strong>
    </button>,
    tray: <div id={trayId} hidden={!expanded} className={styles.tray}>
      <header className={styles.trayHeader}><h3>{tUi("Кадры и настройки сцены")}</h3><button type="button" className={styles.reset}
        disabled={locked || attachments.isUploading} onClick={() => { setResetError(''); setConfirmReset(true); }}>{tUi("Сбросить всё")}</button></header>
      <div className={styles.trayRow}>
        <div className={styles.materials}><HomeVideoMaterials {...{ workspaceId, attachments, materials }} disabled={locked} /></div>
        <div className={styles.layerCards}>{VIDEO_DIRECTION_LAYERS.map((item) => {
          const configured = videoLayerConfigured(direction, item.id) || Boolean(covers[item.id]);
          const Icon = VIDEO_LAYER_ICONS[item.id];
          return <button type="button" key={item.id} className={styles.layerCard} disabled={locked} data-configured={configured}
            aria-label={`${item.label}${configured ? tUi(", настроено") : tUi(", настроить")}`} aria-haspopup="dialog" onClick={() => setLayer(item.id)}>
            <span className={styles.layerCover}>{configured
              ? covers[item.id] ? <img src={`/api/assets/${encodeURIComponent(covers[item.id]!)}/content?variant=thumbnail`} alt="" draggable={false} />
                : <Image src={`/home/video-direction/${item.id}.webp`} width={72} height={72} sizes="72px" alt="" draggable={false} />
              : <Icon size={22} strokeWidth={1.4} />}</span><span>{item.label}</span>
          </button>;
        })}</div>
      </div>
    </div>,
    dialogs: <>
      {layer ? <VideoDirectionDialog {...{ workspaceId, subjects }} coverAssetId={covers[layer]} layer={layer} value={direction} onChange={setDirection}
        onSubjectsChange={setSubjects} onLayerChange={setLayer} onCoverChange={(cover) => setCovers((current) => ({ ...current, [layer]: cover }))} onClose={() => setLayer(null)} disabled={locked} /> : null}
      {confirmReset ? <VideoDirectionDialogShell title={tUi("Сбросить настройки видео?")} compact busy={resetting} onClose={() => setConfirmReset(false)}>
        <p className={styles.confirmCopy}>{tUi("Уберём кадры, референсы и выбранных героев. Настройки истории, сцены, камеры и параметры видео вернутся к исходным. Текст запроса, файлы и сохранённые стили в Library останутся.")}</p>
        {resetError ? <p className={styles.error} role="alert">{typeof (resetError) === 'string' ? tUi((resetError) as string) : (resetError)}</p> : null}
        <footer className={styles.footer}><button type="button" autoFocus className={styles.secondary} disabled={resetting} onClick={() => setConfirmReset(false)}>{tUi("Оставить")}</button>
          <button type="button" className={styles.primary} disabled={locked || attachments.isUploading} onClick={() => void reset()}>{resetting ? tUi("Сбрасываем…") : tUi("Сбросить всё")}</button></footer>
      </VideoDirectionDialogShell> : null}
    </>,
  };
}
