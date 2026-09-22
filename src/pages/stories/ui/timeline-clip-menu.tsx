'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, SlidersHorizontal, Trash2, Unplug, AudioLines } from '@prodactionpro/ui-core/icons';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { useCanSplit } from './timeline-split-button';
import styles from './timeline-clip-menu.module.css';

import type { ClipMenuTarget } from '../model/timeline-selection';
export function TimelineClipMenu({ target, snapshot, clock, onClose, onSplit, onDelete, onUnlink, onExtractAudio, onInspect }: {
  target: ClipMenuTarget; snapshot: TimelineSnapshot; clock: RefObject<{ timeMs: number }>; onClose(): void; onSplit(): void; onDelete(): void; onUnlink(): void; onExtractAudio(): void; onInspect(): void;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDivElement>(null), canSplit = useCanSplit(snapshot, target, clock);
  useEffect(() => {
    const menu = ref.current; if (!menu) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: Event) => { if (!menu.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', dismiss); window.addEventListener('resize', onClose); document.addEventListener('scroll', dismiss, true);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', onClose); document.removeEventListener('scroll', dismiss, true); if (document.activeElement === document.body || menu.contains(document.activeElement)) prior?.focus(); };
  }, [target, onClose]);
  const act = (action: () => void) => { action(); onClose(); };
  return createPortal(<div ref={ref} className={styles.menu} role="menu" aria-label={tUi("Действия с клипом")} style={{ left: target.x, top: target.y }} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button role="menuitem" type="button" disabled={!canSplit} onClick={() => act(onSplit)}><Scissors size={15} />{tUi("Разрезать по игле")}</button>
    {snapshot.audioClips?.some((clip) => Boolean(clip.linkedVideoClipId) && (target.kind === 'video' ? clip.linkedVideoClipId === target.id : clip.id === target.id)) ? <button role="menuitem" type="button" onClick={() => act(onUnlink)}><Unplug size={15} />{tUi("Открепить звук от видео")}</button> : null}
    {target.kind === 'video' && snapshot.clips.some((clip) => clip.id === target.id && clip.kind === 'video' && !clip.sourceAudioMuted) ? <button role="menuitem" type="button" onClick={() => act(onExtractAudio)}><AudioLines size={15} />{tUi("Отделить звук на аудиодорожку")}</button> : null}
    <button role="menuitem" type="button" onClick={() => act(onInspect)}><SlidersHorizontal size={15} />{tUi("Свойства клипа")}</button>
    <button role="menuitem" type="button" onClick={() => act(onDelete)}><Trash2 size={15} />{tUi("Убрать клип")}</button>
  </div>, document.body);
}
