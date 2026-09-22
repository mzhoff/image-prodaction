'use client';

import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { timelineSeekTime } from './timeline-navigation';

export function useTimelineScrub({ ruler, clock: clockRef, duration, frameRate, scale, onSeek }: {
  ruler: RefObject<HTMLDivElement | null>; clock: RefObject<{ timeMs: number; running: boolean }>;
  duration: number; frameRate: number; scale: number; onSeek(timeMs: number): void;
}) {
  const frame = useRef(0), pending = useRef<number | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const update = (event: PointerEvent<HTMLElement>) => {
    if (!ruler.current) return;
    const at = timelineSeekTime((event.clientX - ruler.current.getBoundingClientRect().left) * 1000 / scale, duration, frameRate);
    clockRef.current = { timeMs: at, running: false };
    pending.current = at;
  };
  const flush = () => {
    cancelAnimationFrame(frame.current); frame.current = 0;
    if (pending.current !== null) { onSeek(pending.current); pending.current = null; }
  };
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
      update(event); flush();
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      update(event);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      update(event); flush(); event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onLostPointerCapture: flush,
    onPointerCancel: flush,
  };
}
