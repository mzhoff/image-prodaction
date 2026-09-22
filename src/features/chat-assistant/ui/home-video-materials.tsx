'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, LibraryBig, LoaderCircle, Upload, X } from '@prodactionpro/ui-core/icons';
import { HOME_VIDEO_SLOT_IDS, type HomeVideoSlotId } from '@/shared/media/home-video-intent';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import type { HomeAttachments } from '../model/use-home-image-submit';
import type { useHomeVideoMaterials } from '../model/use-home-video-materials';
import { VIDEO_SLOT_LABELS } from '../model/home-video-materials';
import { ComposerFilePreview } from './home-image-attachments';
import { HomeLibraryReferenceDialog } from './home-library-reference-picker';
import styles from './home-video-materials.module.css';

type Materials = ReturnType<typeof useHomeVideoMaterials>;
export function HomeVideoMaterials({ workspaceId, attachments, materials, disabled }: {
  workspaceId: string; attachments: HomeAttachments; materials: Materials; disabled: boolean;
}) {
  const tUi = useTranslations();
  const ui_VIDEO_SLOT_LABELS = useUiCatalog(VIDEO_SLOT_LABELS, tUi);
  const [selected, setSelected] = useState<HomeVideoSlotId | null>(null);
  const [library, setLibrary] = useState<HomeVideoSlotId | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<HomeVideoSlotId | null>(null);
  const add = async (slot: HomeVideoSlotId, files: File[]) => {
    if (disabled || !files.length) return;
    try {
      await materials.add(slot, files[0]);
      materials.setNotice(files.length > 1 ? tUi("В один слот добавлено одно изображение. Остальные можно добавить в свободные слоты.") : '');
      setSelected(null);
    } catch (error) { materials.setNotice(error instanceof Error ? error.message : tUi("Не удалось добавить изображение. Повторите попытку.")); }
  };
  const slots = HOME_VIDEO_SLOT_IDS.filter((slot) => materials.available.includes(slot) || materials.bindings[slot]);
  const groups = [{ label: tUi("Кадры"), slots: slots.filter((slot) => !slot.startsWith('reference')) },
    { label: tUi("Референсы"), slots: slots.filter((slot) => slot.startsWith('reference')) }].filter((group) => group.slots.length);
  const selectedItem = selected && attachments.items.find((item) => item.id === materials.bindings[selected]?.itemId);
  return <div className={styles.materials}>
    <input type="file" hidden ref={upload} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = '';
      if (uploadTarget.current) void add(uploadTarget.current, files);
    }} />
    <div className={styles.groups}>
      {groups.map((group) => <section className={styles.group} key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3><div className={styles.slots}>{group.slots.map((slot) => {
          const binding = materials.bindings[slot];
          const item = attachments.items.find((candidate) => candidate.id === binding?.itemId);
          const supported = materials.available.includes(slot);
          return <div className={styles.slot} key={slot} data-supported={supported} onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); }
          }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!item) void add(slot, Array.from(event.dataTransfer.files)); else materials.setNotice(tUi("Сначала уберите изображение из этого слота или используйте свободный слот.")); }}>
            <ProTooltip label={item ? tUi("{p1} — описание и роль", { p1: ui_VIDEO_SLOT_LABELS[slot] }) : tUi("Добавить: {p1}", { p1: ui_VIDEO_SLOT_LABELS[slot].toLowerCase() })}>
              <button type="button" className={styles.tile} aria-label={`${item ? tUi("Настроить") : tUi("Добавить")}: ${ui_VIDEO_SLOT_LABELS[slot]}`} disabled={disabled || (!item && !attachments.canAdd)} onClick={() => { materials.setNotice(''); setSelected(slot); }}>
                {item ? <ComposerFilePreview file={item.file} /> : <><ImagePlus size={20} /><span>{slot === 'firstFrame' ? <>{tUi("Первый")}<br />{tUi("кадр")}</> : slot === 'lastFrame' ? <>{tUi("Последний")}<br />{tUi("кадр")}</> : ui_VIDEO_SLOT_LABELS[slot]}</span></>}
                {item && ['queued', 'uploading'].includes(item.status) ? <span className={styles.progress}><LoaderCircle size={18} /></span> : null}
                {item?.status === 'failed' ? <span className={styles.progress}>{tUi("Ошибка")}</span> : null}
              </button>
            </ProTooltip>
            {item ? <><button type="button" className={styles.remove} disabled={disabled} aria-label={tUi("Убрать: {p1}", { p1: ui_VIDEO_SLOT_LABELS[slot] })} onClick={() => void materials.remove(slot)}><X size={12} /></button>
              <small className={styles.caption}>{ui_VIDEO_SLOT_LABELS[slot]}{binding?.description ? ' · •' : ''}</small></> : null}
          </div>;
        })}</div>
      </section>)}
      {materials.unassigned.length ? <section className={styles.group}><h3>{tUi("Не подходят для этой модели")}</h3><div className={styles.slots}>
        {materials.unassigned.map((item) => <div className={styles.slot} key={item.id}><div className={styles.tile}><ComposerFilePreview file={item.file} /></div>
          <button className={styles.remove} type="button" disabled={disabled} aria-label={tUi("Убрать {p1}", { p1: item.file.name })} onClick={() => void attachments.remove(item.id)}><X size={12} /></button></div>)}
      </div></section> : null}
    </div>
    {selected ? <SlotDialog label={ui_VIDEO_SLOT_LABELS[selected]} onClose={() => setSelected(null)}>
      {selectedItem ? <>
        <div className={styles.editPreview}><ComposerFilePreview file={selectedItem.file} /></div>
        <fieldset className={styles.roles}><legend>{tUi("Роль изображения")}</legend>{materials.available.map((slot) =>
          <button key={slot} type="button" aria-pressed={slot === selected} disabled={disabled}
            onClick={() => { materials.move(selected, slot); setSelected(slot); }}>{ui_VIDEO_SLOT_LABELS[slot]}</button>)}
        </fieldset>
        <label className={styles.field}>{tUi("Что взять из изображения")}<textarea aria-label={tUi("Описание материала")} value={materials.bindings[selected]?.description ?? ''}
          maxLength={2000} rows={3} disabled={disabled} placeholder={tUi("Например: сохранить героя, одежду и освещение")} onChange={(event) => materials.describe(selected, event.target.value)} /></label>
        {selectedItem.status === 'failed' ? <><p className={styles.notice}>{tUi("Не удалось загрузить изображение. Проверьте подключение и попробуйте ещё раз.")}</p><button className={styles.action} type="button" disabled={disabled} onClick={() => void attachments.retry(selectedItem.id)}>{tUi("Повторить загрузку")}</button></> : null}
        <button className={styles.action} type="button" onClick={() => setSelected(null)}>{tUi("Готово")}</button>
      </> : <div className={styles.sources}>
        <button className={styles.action} type="button" disabled={disabled} onClick={() => { uploadTarget.current = selected; upload.current?.click(); }}><Upload size={18} />{tUi("С устройства")}</button>
        <button className={styles.action} type="button" disabled={disabled} onClick={() => { setLibrary(selected); setSelected(null); }}><LibraryBig size={18} />{tUi("Из Library")}</button>
      </div>}
      {materials.notice ? <p className={styles.notice} role="alert">{typeof (materials.notice) === 'string' ? tUi((materials.notice) as string) : (materials.notice)}</p> : null}
    </SlotDialog> : null}
    {library ? <HomeLibraryReferenceDialog workspaceId={workspaceId} onClose={() => setLibrary(null)} maxSelection={1} onChoose={async (files) => { if (files[0]) await materials.add(library, files[0]); }} /> : null}
  </div>;
}

function SlotDialog({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return createPortal(<dialog ref={ref} className={styles.dialog} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h3>{label}</h3><button type="button" aria-label={tUi("Закрыть настройку материала")} onClick={onClose}><X size={18} /></button></header>{children}
  </dialog>, document.body);
}
