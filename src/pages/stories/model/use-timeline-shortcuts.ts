'use client';
import { useEffect, useEffectEvent } from 'react';
import type { TimelineHistory } from '../ui/timeline-transport';

export function timelineTextTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('textarea, select, [role="textbox"]')) return true;
  return target instanceof HTMLInputElement && !['button', 'submit', 'reset', 'range', 'checkbox', 'radio', 'file', 'color', 'hidden', 'image'].includes(target.type);
}

export function useTimelineShortcuts({ disabled, onPlay, history }: { disabled: boolean; onPlay(): void; history: TimelineHistory }) {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || disabled || timelineTextTarget(event.target)) return;
    if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); if (!event.repeat) onPlay();
    } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyZ') {
      event.preventDefault(); if (event.repeat) return;
      if (event.shiftKey ? history.canRedo : history.canUndo) (event.shiftKey ? history.redo : history.undo)();
    }
  });
  useEffect(() => { const listener = (event: KeyboardEvent) => handle(event); window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
}
