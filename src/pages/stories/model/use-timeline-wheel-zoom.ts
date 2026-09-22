'use client';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, type RefObject } from 'react';

export function useTimelineWheelZoom(scroll: RefObject<HTMLDivElement | null>, scale: number, onScale: (value: number) => void) {
  const anchor = useRef<{ time: number; x: number } | null>(null);
  const wheel = useEffectEvent((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const element = scroll.current; if (!element) return;
    const x = Math.max(160, event.clientX - element.getBoundingClientRect().left);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
    const next = Math.max(4, Math.min(120, scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.005)));
    if (next === scale) return;
    anchor.current = { time: (element.scrollLeft + x - 160) / scale, x };
    onScale(next);
  });
  useEffect(() => { const element = scroll.current, listener = (event: WheelEvent) => wheel(event); element?.addEventListener('wheel', listener, { passive: false }); return () => element?.removeEventListener('wheel', listener); }, [scroll]);
  useLayoutEffect(() => { if (anchor.current && scroll.current) { scroll.current.scrollTo({ left: anchor.current.time * scale - anchor.current.x + 160 }); anchor.current = null; } }, [scale, scroll]);
}
