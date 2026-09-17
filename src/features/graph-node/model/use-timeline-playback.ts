'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { useEventCallback } from '@/shared/lib/use-event-callback';
import type { TimelineAnalysis, TimelineShot } from '@/shared/media/timeline-contracts';
import { nearestTimelineFrame } from '@/shared/media/timeline-editing';
import { shotPlaybackFrames, timelineLoopTime, timelineSpaceAllowed } from './timeline-playback';

export function useTimelinePlayback({ analysis, shot, nodeId, previewMode, onPreviewMode }: {
  analysis: TimelineAnalysis; shot: TimelineShot; nodeId?: string;
  previewMode: 'video' | 'image'; onPreviewMode: (mode: 'video' | 'image') => void;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const frames = useMemo(() => shotPlaybackFrames(analysis, shot), [analysis, shot]);
  const [cursor, setCursor] = useState(shot.frames[0]?.timeMs ?? shot.startMs);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [stillTime, setStillTime] = useState(shot.frames[0]?.timeMs ?? shot.startMs);
  const intent = useRef(false);
  const request = useRef(0);
  const time = nearestTimelineFrame(frames, cursor);

  const pause = useEventCallback(() => {
    request.current += 1; intent.current = false;
    player.current?.pause(); setPlaying(false);
  });
  const seek = useEventCallback((next: number) => {
    pause();
    const frame = nearestTimelineFrame(frames, next);
    setCursor(frame);
    if (player.current) player.current.currentTime = frame / 1000;
  });
  const toggle = useEventCallback(async () => {
    const video = player.current;
    if (!video) return;
    if (intent.current) { pause(); return; }
    onPreviewMode('video'); setMediaError(false);
    intent.current = true;
    const token = ++request.current;
    const start = timelineLoopTime(video.currentTime * 1000, shot.startMs, shot.endMs);
    if (start !== video.currentTime * 1000) video.currentTime = start / 1000;
    try {
      await video.play();
      if (token !== request.current || !intent.current) return;
      setPlaying(true);
    } catch {
      if (token !== request.current) return;
      intent.current = false; setPlaying(false); setMediaError(true);
    }
  });
  const syncTime = useEventCallback(() => {
    const video = player.current;
    if (!video) return;
    const now = video.currentTime * 1000;
    if (intent.current) {
      // Let the native ended event restart the last shot; resetting here would hide
      // video.ended from the preceding pause event and lose the playback intent.
      if (video.ended) return;
      const bounded = timelineLoopTime(now, shot.startMs, shot.endMs);
      if (bounded !== now) video.currentTime = bounded / 1000;
      setCursor(bounded);
    } else setCursor(Math.max(shot.startMs, Math.min(shot.endMs, now)));
  });
  const ended = useEventCallback(() => {
    if (!intent.current || !player.current) { setPlaying(false); return; }
    player.current.currentTime = shot.startMs / 1000;
    setCursor(shot.startMs);
    const token = request.current;
    void player.current.play().catch(() => {
      if (token !== request.current) return;
      intent.current = false; setPlaying(false); setMediaError(true);
    });
  });

  useEffect(() => {
    if (playing) return;
    const timer = setTimeout(() => setStillTime(time), 140);
    return () => clearTimeout(timer);
  }, [playing, time]);
  useEffect(() => {
    const video = player.current;
    if (video && !playing) video.currentTime = time / 1000;
  }, [playing, time]);
  useEffect(() => {
    if (!playing) return;
    let tick = 0;
    const update = () => { syncTime(); tick = requestAnimationFrame(update); };
    tick = requestAnimationFrame(update);
    return () => cancelAnimationFrame(tick);
  }, [playing, syncTime]);
  useEffect(() => {
    if (previewMode === 'image') pause();
  }, [pause, previewMode]);
  useEffect(() => () => pause(), [analysis.sourceAssetId, shot.id, shot.startMs, shot.endMs, pause]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) pause(); };
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactiveTarget = Boolean(target?.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="menuitem"], [role="combobox"]'));
      const modal = document.querySelector('dialog[open]');
      if (modal && !modal.contains(player.current)) return;
      if (!timelineSpaceAllowed(event, nodeId, useProductionGraphStore.getState().selectedNodeIds, interactiveTarget)) return;
      event.preventDefault(); event.stopPropagation(); void toggle();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', keyDown, true);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', keyDown, true); };
  }, [nodeId, pause, toggle]);

  return { player, time, stillTime, frames, playing, mediaError, seek, pause, toggle,
    videoProps: {
      onLoadedMetadata: () => { if (player.current) player.current.currentTime = time / 1000; },
      onTimeUpdate: syncTime,
      onPlay: () => { if (!intent.current || document.hidden) player.current?.pause(); else setPlaying(true); },
      onPause: () => { if (intent.current && player.current?.ended) return; intent.current = false; setPlaying(false); },
      onEnded: ended,
      onError: () => { pause(); setMediaError(true); },
    },
  };
}
