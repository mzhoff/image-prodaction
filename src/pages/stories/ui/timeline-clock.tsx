'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, type RefObject } from 'react';
import { lastTimelineFrame, timelineFrameStep, timelineTimecode } from '../model/timeline-navigation';
import type { useTimelineScrub } from '../model/use-timeline-scrub';
import styles from './timeline-workspace.module.css';

export function TimelinePlayhead({ clockRef, scale, duration, frameRate, onSeek, scrub }: {
  clockRef: RefObject<{ timeMs: number; running: boolean }>; scale: number; duration: number; frameRate: number;
  onSeek(time: number): void; scrub: ReturnType<typeof useTimelineScrub>;
}) {
  const tUi = useTranslations();
  const line = useRef<HTMLDivElement>(null), handle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const time = clockRef.current.timeMs;
      if (line.current) line.current.style.transform = `translateX(${time * scale / 1000}px)`;
      if (handle.current) { handle.current.setAttribute('aria-valuenow', String(Math.min(time, lastTimelineFrame(duration, frameRate)))); handle.current.setAttribute('aria-valuetext', timelineTimecode(time, frameRate)); }
      frame = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(frame);
  }, [clockRef, scale, duration, frameRate]);
  return <div ref={line} className={styles.playhead}><div ref={handle} className={styles.playheadHandle} role="slider" tabIndex={0}
    aria-label={tUi("Позиция на таймлайне")} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={lastTimelineFrame(duration, frameRate)} aria-valuenow={0}
    {...scrub} onKeyDown={(event) => {
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : 0;
      if (direction) { event.preventDefault(); onSeek(timelineFrameStep(clockRef.current.timeMs, direction, duration, frameRate)); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); onSeek(event.key === 'Home' ? 0 : lastTimelineFrame(duration, frameRate)); }
    }} /></div>;
}

export function TimelineEmptyPlayback({ clockRef, playing, durationMs, onStop, seekRequest }: {
  clockRef: RefObject<{ timeMs: number; running: boolean }>; playing: boolean; durationMs: number; seekRequest: { timeMs: number }; onStop(): void;
}) {
  useEffect(() => { clockRef.current = { timeMs: seekRequest.timeMs, running: false }; }, [clockRef, seekRequest]);
  useEffect(() => {
    let frame = 0;
    const at = clockRef.current.timeMs >= durationMs ? 0 : clockRef.current.timeMs, start = performance.now();
    const tick = () => { clockRef.current = { timeMs: Math.min(durationMs, at + performance.now() - start), running: true };
      if (clockRef.current.timeMs >= durationMs) { onStop(); return; } frame = requestAnimationFrame(tick); };
    if (playing) tick();
    return () => { cancelAnimationFrame(frame); clockRef.current.running = false; };
  }, [clockRef, durationMs, onStop, playing, seekRequest]);
  return null;
}
