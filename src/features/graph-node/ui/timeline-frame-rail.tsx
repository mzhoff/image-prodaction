'use client';

import { useEffect, useRef, useState } from 'react';
import type { TimelineShot } from '@/shared/media/timeline-contracts';
import { formatTimelineTime } from '../model/timeline-node-values';
import { timelineFrameAtPosition } from '../model/timeline-playback';

export function TimelineFrameRail({ shot, frames, time, disabled, onSeek, onMove, onPause }: {
  shot: TimelineShot; frames: number[]; time: number; disabled: boolean;
  onSeek: (time: number) => void; onMove: (originalTime: number, time: number) => void; onPause: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ pointerId: number; originalTime: number; restoreTime: number; shotId: string; startMs: number; endMs: number; time: number; lastSeekAt: number } | null>(null);
  const [preview, setPreview] = useState<{ originalTime: number; time: number } | null>(null);
  useEffect(() => () => { if (seekTimer.current !== null) clearTimeout(seekTimer.current); seekTimer.current = null; }, [disabled, shot.id, shot.startMs, shot.endMs]);
  const position = (value: number) => `${Math.max(0, Math.min(100, (value - shot.startMs) / (shot.endMs - shot.startMs) * 100))}%`;
  const finish = (commit: boolean) => {
    const active = drag.current; drag.current = null; setPreview(null);
    if (seekTimer.current !== null) clearTimeout(seekTimer.current); seekTimer.current = null;
    if (!active || active.shotId !== shot.id || active.startMs !== shot.startMs || active.endMs !== shot.endMs) return;
    if (!commit || disabled) { onSeek(active.restoreTime); return; }
    if (active.time !== active.originalTime) onMove(active.originalTime, active.time);
    onSeek(active.time);
  };
  return <div className="timeline-editor-rail-wrap">
    <p className="timeline-editor-shot-range">{formatTimelineTime(shot.startMs)} – {formatTimelineTime(shot.endMs)}</p>
    <div className="timeline-editor-rail" ref={rail}>
      <input className="timeline-editor-scrubber" type="range" aria-label="Choose exact frame" min={shot.startMs} max={shot.endMs} step="any" value={time}
        onChange={(event) => onSeek(timelineFrameAtPosition(frames, shot.startMs, shot.endMs, (Number(event.target.value) - shot.startMs) / (shot.endMs - shot.startMs)))} />
      <div className="timeline-editor-markers" aria-label="Selected still frame markers">
        {shot.frames.map((frame, index) => {
          const markerTime = preview?.originalTime === frame.timeMs ? preview.time : frame.timeMs;
          return <button type="button" key={frame.timeMs} className="timeline-editor-marker" role="slider"
            aria-label={`Selected frame ${index + 1}`} aria-valuemin={shot.startMs} aria-valuemax={frames.at(-1) ?? shot.startMs}
            aria-valuenow={markerTime} aria-valuetext={formatTimelineTime(markerTime)} aria-orientation="horizontal"
            aria-disabled={disabled} data-active={frame.timeMs === time || preview?.originalTime === frame.timeMs}
            style={{ left: position(markerTime) }} title={`Frame ${index + 1} · ${formatTimelineTime(markerTime)} · Drag to move`}
            onClick={(event) => { if (event.detail === 0 || disabled) onSeek(markerTime); }}
            onKeyDown={(event) => {
              const current = frames.indexOf(frame.timeMs);
              const target = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, current - 1)
                : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(frames.length - 1, current + 1)
                  : event.key === 'Home' ? 0 : event.key === 'End' ? frames.length - 1 : null;
              if (target === null || disabled) return;
              event.preventDefault(); event.stopPropagation();
              const next = frames[target]!; onPause(); onMove(frame.timeMs, next); onSeek(next);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (disabled || event.button !== 0) return;
              event.preventDefault(); onPause(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { pointerId: event.pointerId, originalTime: frame.timeMs, restoreTime: time, shotId: shot.id, startMs: shot.startMs, endMs: shot.endMs, time: frame.timeMs, lastSeekAt: event.timeStamp };
              setPreview({ originalTime: frame.timeMs, time: frame.timeMs });
              onSeek(frame.timeMs);
            }}
            onPointerMove={(event) => {
              const active = drag.current; const bounds = rail.current?.getBoundingClientRect();
              if (disabled || !active || event.pointerId !== active.pointerId || !bounds?.width) return;
              const next = timelineFrameAtPosition(frames, shot.startMs, shot.endMs, (event.clientX - bounds.left) / bounds.width);
              active.time = next; setPreview({ originalTime: active.originalTime, time: next });
              // Leave the 140 ms exact-frame debounce time to settle during a long
              // drag. This previews locally; document writes happen only on drop.
              const elapsed = event.timeStamp - active.lastSeekAt;
              if (elapsed >= 200) {
                if (seekTimer.current !== null) clearTimeout(seekTimer.current); seekTimer.current = null;
                active.lastSeekAt = event.timeStamp; onSeek(next);
              } else if (seekTimer.current === null) {
                seekTimer.current = setTimeout(() => {
                  seekTimer.current = null;
                  if (drag.current !== active) return;
                  active.lastSeekAt = performance.now(); onSeek(active.time);
                }, 200 - elapsed);
              }
            }}
            onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
          >{index + 1}</button>;
        })}
      </div>
    </div>
  </div>;
}
