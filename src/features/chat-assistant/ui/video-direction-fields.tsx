'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Check, ChevronDown } from '@prodactionpro/ui-core/icons';
import type { VideoCinematicOption } from '@/shared/media/video-cinematic-catalog';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS } from '@/shared/media/video-cinematic-catalog';
import type { VideoStyleSettings } from '@/shared/media/home-video-direction';
import styles from './video-direction.module.css';

export function DirectionText({ label, value, onChange, placeholder, multiline = false, maxLength = 2000 }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number;
}) {
  return <label className={styles.field}><span>{label}</span>{multiline
    ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} />
    : <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} />}</label>;
}

export function DirectionChoice<T extends string>({ label, value, onChange, options, disabled = false }: {
  label: string; value: T; onChange: (value: T) => void; options: readonly VideoCinematicOption[]; disabled?: boolean;
}) {
  const tUi = useTranslations();
  const selected = options.find((option) => option.id === value);
  return <details className={styles.choice}>
    <summary><span>{label}</span><strong>{selected?.label ?? tUi("Авто")}</strong><ChevronDown size={15} /></summary>
    <div className={styles.choices} role="group" aria-label={label}>{options.map((option) =>
      <button key={option.id} type="button" aria-pressed={value === option.id} disabled={disabled}
        onClick={(event) => { onChange(option.id as T); const details = event.currentTarget.closest('details'); if (details) { details.open = false; details.querySelector('summary')?.focus(); } }}>
        <span><strong>{option.label}</strong>{value === option.id ? <Check size={14} /> : null}</span><small>{option.description}</small>
      </button>)}
    </div>
  </details>;
}

export function VideoStyleFields({ value, onChange }: { value: VideoStyleSettings; onChange: (value: VideoStyleSettings) => void }) {
  const tUi = useTranslations();
  const ui_VIDEO_LOOK_OPTIONS = useUiCatalog(VIDEO_LOOK_OPTIONS, tUi);
  const ui_VIDEO_GRAIN_OPTIONS = useUiCatalog(VIDEO_GRAIN_OPTIONS, tUi);
  return <>
    <DirectionText label={tUi("Описание стиля")} multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })}
      placeholder={tUi("Палитра, настроение, эпоха, обработка — своими словами")} />
    <div className={styles.fieldGrid}>
      <DirectionChoice label={tUi("Образ и эпоха")} value={value.look} options={ui_VIDEO_LOOK_OPTIONS} onChange={(look) => onChange({ ...value, look })} />
      <DirectionChoice label={tUi("Зерно")} value={value.grain} options={ui_VIDEO_GRAIN_OPTIONS} onChange={(grain) => onChange({ ...value, grain })} />
    </div>
  </>;
}
