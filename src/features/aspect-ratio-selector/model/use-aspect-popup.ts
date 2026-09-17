'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAspectPopup(width: number, height: number) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; placement: 'top' | 'bottom' } | null>(null);
  const close = useCallback((restoreFocus = true) => {
    setAnchor(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  const position = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const actualWidth = Math.min(width, window.innerWidth - 16);
    const actualHeight = height + (window.innerWidth < 600 ? 36 : 0);
    const placement = rect.bottom + actualHeight + 4 <= window.innerHeight - 8 ? 'bottom' : 'top';
    const top = placement === 'bottom' ? rect.bottom + 4 : rect.top - actualHeight - 4;
    setAnchor({ placement, width: actualWidth, left: Math.max(8, Math.min(rect.left, window.innerWidth - actualWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - actualHeight - 8)) });
  }, [height, width]);
  const open = anchor !== null;
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    popup.current?.querySelector<HTMLElement>('[role="slider"]:not([aria-disabled="true"]), button')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    const node = trigger.current?.closest('article');
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [close, open, position]);
  return { trigger, popup, anchor, close, position, open };
}
