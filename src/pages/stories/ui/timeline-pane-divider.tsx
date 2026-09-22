'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useRef, type RefObject } from 'react';
import styles from './timeline-workspace.module.css';

export function TimelinePaneDivider({ root, value, onChange }: {
  root: RefObject<HTMLDivElement | null>; value: number; onChange(value: number): void;
}) {
  const tUi = useTranslations();
  const drag = useRef<{ y: number; value: number; height: number } | null>(null);
  const update = (next: number) => onChange(Math.max(24, Math.min(60, next)));
  return <div className={styles.divider} role="separator" tabIndex={0} aria-label={tUi("Высота монтажной области")} aria-orientation="horizontal"
    aria-valuemin={24} aria-valuemax={60} aria-valuenow={Math.round(value)} aria-valuetext={tUi("{p1}% окна", { p1: Math.round(value) })} aria-controls="timeline-tracks"
    onDoubleClick={() => onChange(36)}
    onKeyDown={(event) => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      update(event.key === 'Home' ? 24 : event.key === 'End' ? 60 : value + (event.key === 'ArrowUp' ? 4 : -4));
    }}
    onPointerDown={(event) => {
      if (event.button !== 0 || !root.current) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { y: event.clientY, value, height: root.current.getBoundingClientRect().height };
    }}
    onPointerMove={(event) => { if (drag.current) update(drag.current.value + (drag.current.y - event.clientY) / drag.current.height * 100); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><span /></div>;
}
