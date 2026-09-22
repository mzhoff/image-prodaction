'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef } from 'react';
import styles from './timeline-layout.module.css';

export function TimelineSideDivider({ side, value, onChange, hidden }: { side: 'left' | 'right'; value: number; onChange(value: number): void; hidden: boolean }) {
  const tUi = useTranslations();
  const drag = useRef<{ x: number; width: number } | null>(null);
  return <div hidden={hidden} className={side === 'left' ? styles.leftDivider : styles.rightDivider} role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={side === 'left' ? tUi("Ширина материалов") : tUi("Ширина инструментов")} aria-valuemin={side === 'left' ? 200 : 260} aria-valuemax={720} aria-valuenow={Math.round(value)}
    onDoubleClick={() => onChange(side === 'left' ? 250 : 320)}
    onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); onChange(event.key === 'Home' ? 0 : event.key === 'End' ? 720 : value + (event.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1)); }}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width: value }; }}
    onPointerMove={(event) => { if (drag.current) onChange(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1)); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><span /></div>;
}
