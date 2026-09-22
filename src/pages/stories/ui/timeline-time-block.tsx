'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef, useState, type ReactNode } from 'react';
import styles from './timeline-workspace.module.css';

export function TimelineTimeBlock({ startMs, durationMs, scale, label, selected, tone, children, onSelect, onContextMenu, onDragStart, onMove, onDrop, onResize, disabled, maxDurationMs = 7_200_000 }: {
  startMs: number; durationMs: number; scale: number; label: string; selected?: boolean; tone: 'video' | 'audio' | 'grid'; children: ReactNode;
  onSelect(): void; onContextMenu?(event: Pick<React.MouseEvent, 'clientX' | 'clientY' | 'preventDefault'>): void; onDragStart?(event: React.DragEvent): void; onMove?(event: React.PointerEvent): void; onDrop?(event: React.DragEvent): void; onResize?(duration: number): void; disabled?: boolean; maxDurationMs?: number;
}) {
  const tUi = useTranslations();
  const [delta, setDelta] = useState(0);
  const gesture = useRef<{ x: number; delta: number } | null>(null);
  function bounded(value: number) { return Math.max(100, Math.min(maxDurationMs, value)); }
  return <div className={styles.block} data-tone={tone} data-selected={selected} style={{ left: startMs * scale / 1000, width: Math.max(4, (durationMs + delta) * scale / 1000) }} onDragOver={onDrop ? (event) => event.preventDefault() : undefined} onDrop={onDrop}>
    <button type="button" className={styles.blockSelect} aria-label={label} aria-pressed={selected} disabled={disabled} draggable={!disabled && Boolean(onDragStart)} onDragStart={onDragStart} onPointerDown={onMove} onClick={(event) => { if (!onMove || event.detail === 0) onSelect(); }} onContextMenu={onContextMenu} onKeyDown={(event) => { if (onContextMenu && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); onContextMenu({ preventDefault: () => event.preventDefault(), clientX: box.left + 20, clientY: box.top + 20 }); } }}>{children}</button>
    {onResize ? <button type="button" className={styles.trimHandle} aria-label={tUi("Изменить длительность: {p1}", { p1: label })} disabled={disabled} title={tUi("Тяните границу · стрелки меняют длину на 0,1 сек.")}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onResize(bounded(durationMs + (event.key === 'ArrowLeft' ? -100 : 100))); } }}
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); gesture.current = { x: event.clientX, delta: 0 }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (!gesture.current) return; const change = bounded(durationMs + (event.clientX - gesture.current.x) * 1000 / scale) - durationMs; gesture.current.delta = change; setDelta(change); }}
      onPointerUp={(event) => { if (!gesture.current) return; const value = durationMs + gesture.current.delta; gesture.current = null; setDelta(0); event.currentTarget.releasePointerCapture(event.pointerId); onResize(Math.round(value)); }}
      onPointerCancel={() => { gesture.current = null; setDelta(0); }} /> : null}
  </div>;
}
