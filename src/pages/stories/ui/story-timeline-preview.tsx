'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StoryClip } from '@/modules/story-projects/contracts/story-project';

export function StoryTimelinePreview({ clip, playing, onComplete, onStop, ratio, clockRef, startMs = 0, gain = 1, seekRequest }: {
  clip: Omit<StoryClip, 'kind'> & { kind: 'image' | 'video' | 'gap' }; playing: boolean; onComplete: () => void; onStop: () => void; ratio: string;
  clockRef?: RefObject<{ timeMs: number; running: boolean }>; startMs?: number; gain?: number; seekRequest: { timeMs: number };
}) {
  const tUi = useTranslations();
  const video = useRef<HTMLVideoElement>(null), [error, setError] = useState(false);
  const imageElapsed = useRef(seekRequest.timeMs);
  const appliedSeek = useRef<{ request: typeof seekRequest; sourceInMs: number } | null>(null);
  useEffect(() => { if (video.current) video.current.volume = Math.max(0, Math.min(1, gain)); }, [gain]);
  useEffect(() => {
    const element = video.current;
    let frame = 0, completed = false, cancelled = false;
    const requested = appliedSeek.current?.request !== seekRequest || appliedSeek.current?.sourceInMs !== clip.sourceInMs;
    if (requested) {
      imageElapsed.current = Math.max(0, Math.min(clip.durationMs, seekRequest.timeMs));
      if (element && element.readyState >= 1) element.currentTime = (clip.sourceInMs + imageElapsed.current) / 1000;
      appliedSeek.current = { request: seekRequest, sourceInMs: clip.sourceInMs };
    }
    if (playing && imageElapsed.current >= clip.durationMs) imageElapsed.current = 0;
    const elapsedBeforePlay = imageElapsed.current, started = performance.now();
    const complete = () => { if (playing && !completed) { completed = true; element?.pause(); onComplete(); } };
    if (clip.kind === 'video' && element) {
      if (element.readyState >= 1 && (element.currentTime * 1000 < clip.sourceInMs || (playing && element.currentTime * 1000 >= clip.sourceInMs + clip.durationMs))) element.currentTime = clip.sourceInMs / 1000;
      if (playing) void element.play().catch(() => { if (!cancelled) onStop(); }); else element.pause();
      element.addEventListener('ended', complete);
    }
    const pausedElapsed = requested || clip.kind !== 'video' ? imageElapsed.current : Math.max(0, (element?.currentTime ?? 0) * 1000 - clip.sourceInMs);
    if (clockRef) clockRef.current = { timeMs: startMs + Math.min(pausedElapsed, clip.durationMs), running: false };
    const tick = () => {
      const elapsed = clip.kind !== 'video' ? elapsedBeforePlay + performance.now() - started : element?.readyState ? Math.max(0, element.currentTime * 1000 - clip.sourceInMs) : pausedElapsed;
      if (clockRef) clockRef.current = { timeMs: startMs + Math.min(elapsed, clip.durationMs), running: playing && (clip.kind !== 'video' || Boolean(element && !element.paused && !element.seeking && element.readyState >= 3)) };
      if (playing && elapsed >= clip.durationMs) { complete(); return; }
      frame = requestAnimationFrame(tick);
    };
    if (playing) tick();
    return () => {
      cancelled = true; cancelAnimationFrame(frame); element?.removeEventListener('ended', complete); element?.pause();
      if (playing && clip.kind !== 'video') imageElapsed.current = Math.min(clip.durationMs, elapsedBeforePlay + performance.now() - started);
      if (clockRef) clockRef.current.running = false;
    };
  }, [playing, clip.kind, clip.sourceInMs, clip.durationMs, onComplete, onStop, clockRef, startMs, seekRequest]);
  if (error) return <p role="alert">{tUi("Не удалось воспроизвести материал. Проверьте его в Library или замените клип.")}</p>;
  const url = `/api/assets/${clip.assetId}/content`;
  return <div className="story-timeline-picture" style={{ aspectRatio: ratio.replace(':', '/'), width: `min(100cqw, calc(100cqh * ${Number(ratio.split(':')[0]) / Number(ratio.split(':')[1])}))` }}>
    {clip.kind === 'gap' ? <div aria-label={tUi("Пустой участок таймлайна")} style={{ aspectRatio: ratio.replace(':', '/'), background: '#000' }} /> : clip.kind === 'image' ? <img src={url} alt={tUi("Выбранный кадр монтажа")} onError={() => { setError(true); onStop(); }} draggable={false} />
      : <video ref={video} src={url} preload="auto" playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = (clip.sourceInMs + seekRequest.timeMs) / 1000; if (clockRef) clockRef.current.timeMs = startMs + seekRequest.timeMs; }}
        onError={() => { setError(true); onStop(); }} />}
  </div>;
}
