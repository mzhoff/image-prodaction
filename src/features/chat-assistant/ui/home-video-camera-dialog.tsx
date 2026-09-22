'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from '@prodactionpro/ui-core/icons';
import type { VideoCameraSettings } from '@/shared/media/home-video-intent';
import { CAMERA_FIELDS } from './home-video-camera-fields';
import styles from './home-video-camera-controls.module.css';

const ERAS = [
  { id: 'all', label: 'Все годы' }, { id: '1970', label: '1970-е' },
  { id: '1980', label: '1980-е' }, { id: '2000', label: '2000-е' }, { id: 'modern', label: 'Современные' },
];
const LOOK_ERA: Record<string, string> = { film70s: '1970', film80s: '1980', vhs80s: '1980', minidv2000s: '2000', modern: 'modern' };

/** Figma 725:3847: white shell, compact header, filters and inset option cards. */
export function CinematicOptionsDialog({ field, value, onChange, onClose, disabled }: {
  field: keyof VideoCameraSettings; value: VideoCameraSettings; onChange: (value: VideoCameraSettings) => void;
  onClose: () => void; disabled: boolean;
}) {
  const tUi = useTranslations();
  const ui_CAMERA_FIELDS = useUiCatalog(CAMERA_FIELDS, tUi);
  const ui_ERAS = useUiCatalog(ERAS, tUi);
  const dialog = useRef<HTMLDialogElement>(null);
  const [era, setEra] = useState('all');
  const definition = ui_CAMERA_FIELDS.find((item) => item.key === field)!;
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-label={definition.title}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.dialogSurface}>
      <header className={styles.header}><h2>{definition.title}</h2><button type="button" aria-label={tUi("Закрыть выбор")} onClick={onClose}><X size={16} /></button></header>
      <div className={styles.body}>
        {field === 'look' ? <div className={styles.filters} role="group" aria-label={tUi("Эпоха камеры")}>
          {ui_ERAS.map((item) => <button type="button" key={item.id} aria-pressed={era === item.id} onClick={() => setEra(item.id)}>{item.label}</button>)}
        </div> : null}
        <div className={styles.options}>
          {definition.options.filter((option) => field !== 'look' || era === 'all' || LOOK_ERA[option.id] === era).map((option) => <button type="button" key={option.id}
            disabled={disabled} aria-pressed={value[field] === option.id} onClick={() => { onChange({ ...value, [field]: option.id }); onClose(); }}>
            <span className={styles.optionIcon}><definition.Icon size={26} />{value[field] === option.id ? <Check size={16} /> : null}</span>
            <strong>{option.label}</strong><span>{option.description}</span>
          </button>)}
        </div>
      </div>
    </div>
  </dialog>, document.body);
}
