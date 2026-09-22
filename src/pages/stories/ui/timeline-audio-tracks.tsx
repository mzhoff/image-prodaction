'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';

export function TimelineAudioTracks({ snapshot, clock, playing }: {
  snapshot: TimelineSnapshot; clock: RefObject<{ timeMs: number; running: boolean }>; playing: boolean;
}) {
  const players = useRef(new Map<string, HTMLAudioElement>());
  const clips = snapshot.audioClips;
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      for (const clip of clips ?? []) {
        const audio = players.current.get(clip.id); if (!audio) continue;
        const elapsed = clock.current.timeMs - clip.startMs;
        audio.volume = Math.min(1, clip.gain);
        if (!playing || !clock.current.running || elapsed < 0 || elapsed >= clip.durationMs) { audio.pause(); continue; }
        const time = (clip.sourceInMs + elapsed) / 1000;
        if (Number.isFinite(audio.duration) && time >= audio.duration) { audio.pause(); continue; }
        if (Math.abs(audio.currentTime - time) > 0.08) audio.currentTime = time;
        if (audio.paused) void audio.play().catch(() => undefined);
      }
      if (playing) frame = requestAnimationFrame(sync);
    };
    sync(); const mounted = players.current;
    return () => { cancelAnimationFrame(frame); for (const audio of mounted.values()) audio.pause(); };
  }, [clips, clock, playing]);
  return <>{(clips ?? []).map((clip) => <audio key={clip.id} ref={(audio) => { if (audio) players.current.set(clip.id, audio); else players.current.delete(clip.id); }} src={`/api/assets/${clip.assetId}/content`} preload="metadata" />)}</>;
}
