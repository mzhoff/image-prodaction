'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { ChevronDown } from '@prodactionpro/ui-core/icons';
import { type VideoCameraSettings } from '@/shared/media/home-video-intent';
import { CAMERA_FIELDS } from './home-video-camera-fields';
import { CinematicOptionsDialog } from './home-video-camera-dialog';
import styles from './home-video-camera-controls.module.css';

export function HomeVideoCameraControls({ value, onChange, disabled }: {
  value: VideoCameraSettings; onChange: (value: VideoCameraSettings) => void; disabled: boolean;
}) {
  const tUi = useTranslations();
  const ui_CAMERA_FIELDS = useUiCatalog(CAMERA_FIELDS, tUi);
  const isStatic = value.movement === 'static';
  const [open, setOpen] = useState<keyof VideoCameraSettings | null>(null);
  return <section className={styles.root} aria-label={tUi("Камера и движение")}>
    <div className={styles.cards}>
      {ui_CAMERA_FIELDS.map(({ key, title, Icon, options }) => {
        const inactive = key === 'speed' && isStatic;
        const selected = options.find((option) => option.id === value[key]);
        return <button type="button" key={key} className={styles.control} aria-haspopup="dialog" aria-expanded={open === key}
          aria-label={`${title}: ${inactive ? tUi("не применяется к неподвижной камере") : selected?.label ?? tUi("Авто")}`}
          disabled={disabled || inactive} onClick={() => setOpen(key)}>
          <Icon size={18} /><span><small>{title}</small><strong>{inactive ? tUi("Не применяется") : selected?.label ?? tUi("Авто")}</strong></span><ChevronDown size={14} />
        </button>;
      })}
    </div>
    {open ? <CinematicOptionsDialog field={open} value={value} disabled={disabled} onChange={onChange} onClose={() => setOpen(null)} /> : null}
  </section>;
}
