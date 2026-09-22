'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef, type RefObject } from 'react';
import { timelineClipDurationLimit } from '@/modules/story-projects/core/timeline-placement';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import type { MontageSlot } from '@/modules/story-projects/contracts/timeline-production';
import { useTimelineClipDrag } from '../model/use-timeline-clip-drag';
import { useTimelineWheelZoom } from '../model/use-timeline-wheel-zoom';
import { timelineVideoDuration } from '@/modules/story-projects/core/timeline-video';
import { TimelineVideoLanes } from './timeline-video-lanes';
import type { ClipMenuTarget } from '../model/timeline-selection';
import { normalizeAudioLanes, timelineAudioLanes } from '@/modules/story-projects/core/timeline-track-editing';
import { useTimelineScrub } from '../model/use-timeline-scrub';
import { TimelineTimeBlock } from './timeline-time-block';
import { TimelinePlayhead } from './timeline-clock';
import styles from './timeline-workspace.module.css';

import { timeLabel, type TimelineSelection } from '../model/timeline-selection';

export function TimelineTracks({ snapshot: savedSnapshot, slots, scale, snapping, onScale, duration, seekDuration, selection, clock, playing, onSelect, onChange, onResizeVideo, onResizeAudio, onResizeSlot, onSeek, onAssetDrop, onError, nameFor, onContextMenu }: {
  snapshot: TimelineSnapshot; snapping: boolean; onScale(value: number): void; slots?: MontageSlot[]; scale: number; duration: number; seekDuration: number; selection: TimelineSelection; clock: RefObject<{ timeMs: number; running: boolean }>; playing: boolean;
  onSelect(value: TimelineSelection): void; onChange(value: TimelineSnapshot): void;
  onResizeVideo(id: string, duration: number): void; onResizeAudio(id: string, duration: number): void; onResizeSlot(index: number, duration: number): void;
  onContextMenu(target: ClipMenuTarget): void;
  onSeek(ms: number): void; onAssetDrop(id: string, trackId?: string, startMs?: number): void; onError(message: string): void; nameFor(id: string): string;
}) {
  const tUi = useTranslations();
  const ruler = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null);
  const drag = useTimelineClipDrag({ snapshot: savedSnapshot, scale, snapping, scroll, onChange, onError, onSelect: (kind, id) => onSelect({ kind, id }) });
  const snapshot = drag.snapshot;
  useTimelineWheelZoom(scroll, scale, onScale);
  const scrub = useTimelineScrub({ ruler, clock, duration: seekDuration, frameRate: snapshot.frameRate ?? 30, scale, onSeek });
  const tracks = timelineAudioLanes(snapshot), width = Math.max(720, Math.max(duration, timelineVideoDuration(snapshot), ...(snapshot.audioClips ?? []).map((clip) => clip.startMs + clip.durationMs)) * scale / 1000 + 80);
  const tickSeconds = Math.max(Math.ceil(duration / 100_000), scale >= 100 ? 1 : scale >= 30 ? 5 : scale >= 10 ? 10 : 30);
  function reorderTrack(id: string, index: number) {
    const normalized = normalizeAudioLanes(snapshot), next = [...normalized.audioTracks!], from = next.findIndex((track) => track.id === id);
    if (from < 0 || index < 0 || index >= next.length) return;
    const [track] = next.splice(from, 1); next.splice(index, 0, track); onChange({ ...normalized, audioTracks: next });
  }
  return <div ref={scroll} data-dragging={Boolean(drag.draggingId)} className={styles.trackScroll} aria-label={tUi("Дорожки таймлайна")}><div className={styles.trackCanvas} style={{ width: width + 160 }}>
    <div className={styles.trackRow}><div className={styles.trackLabel}>{tUi("Время")}</div><div ref={ruler} data-timeline-ruler className={styles.ruler} style={{ width }} {...scrub}>
      {Array.from({ length: Math.ceil(duration / (tickSeconds * 1000)) + 1 }, (_, index) => <button type="button" key={index} style={{ left: index * tickSeconds * scale }} aria-label={tUi("Перейти к {p1} секундам", { p1: index * tickSeconds })} onClick={(event) => { event.stopPropagation(); if (event.detail === 0) onSeek(index * tickSeconds * 1000); }}>{timeLabel(index * tickSeconds * 1000)}</button>)}
    </div></div>
    {slots?.length ? <div className={styles.trackRow}><div className={styles.trackLabel}><strong>{tUi("Ритм")}</strong><small>{tUi("Предложение ·")}{' '} {slots.length}  {' '}{tUi("ячеек")}</small></div><div className={styles.lane} style={{ width }}>
      {slots.map((slot, index) => <TimelineTimeBlock key={slot.id} startMs={slot.startMs} durationMs={slot.durationMs} scale={scale} label={tUi("Ячейка {p1}", { p1: index + 1 })} selected={selection?.kind === 'grid' && selection.id === slot.id} tone="grid" disabled={playing} onSelect={() => onSelect({ kind: 'grid', id: slot.id })}
        maxDurationMs={slot.durationMs + (slots[index + 1]?.durationMs ?? 0) - 100} onResize={!slot.lockedClipId && slots[index + 1] && !slots[index + 1].lockedClipId ? (value) => onResizeSlot(index, value) : undefined}>
        <strong>{slot.lockedClipId ? '◆' : index + 1}</strong><small>{(slot.durationMs / 1000).toFixed(2)}  {' '}{tUi("с")}</small></TimelineTimeBlock>)}
    </div></div> : null}
    <TimelineVideoLanes onMove={drag.begin} snapshot={snapshot} scale={scale} width={width} playing={playing} selection={selection} onSelect={onSelect} onChange={onChange} onResize={onResizeVideo} onAssetDrop={onAssetDrop} nameFor={nameFor} onContextMenu={onContextMenu} />
    {tracks.map((track, index) => <div key={track.id} className={styles.trackRow}><div className={styles.trackLabel} draggable={!playing} onDragStart={(event) => event.dataTransfer.setData('application/x-audio-track', track.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderTrack(event.dataTransfer.getData('application/x-audio-track'), index); }}>
      <button type="button" aria-label={tUi("Настроить дорожку {p1}", { p1: track.name })} onClick={() => onSelect({ kind: 'track', id: track.id })}>{track.name}</button><div><button type="button" aria-label={tUi("Поднять дорожку {p1}", { p1: track.name })} disabled={playing || index === 0} onClick={() => reorderTrack(track.id, index - 1)}>↑</button><button type="button" aria-label={tUi("Опустить дорожку {p1}", { p1: track.name })} disabled={playing || index === tracks.length - 1} onClick={() => reorderTrack(track.id, index + 1)}>↓</button></div>
    </div><div className={styles.lane} data-clip-lane="audio" data-track-id={track.id} style={{ width }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); const at = Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) * 1000 / scale);
      const asset = event.dataTransfer.getData('application/x-timeline-asset'); if (asset) { onAssetDrop(asset, track.id, at); return; }

    }}>
      {(snapshot.audioClips ?? []).filter((clip) => (clip.trackId ?? clip.id) === track.id).map((clip) => <TimelineTimeBlock key={clip.id} startMs={clip.startMs} durationMs={clip.durationMs} scale={scale} label={tUi("Аудиоклип {p1}", { p1: nameFor(clip.assetId) })} selected={selection?.kind === 'audio' && selection.id === clip.id} tone="audio" disabled={playing} onSelect={() => onSelect({ kind: 'audio', id: clip.id })} onContextMenu={(event) => { event.preventDefault(); onContextMenu({ kind: 'audio', id: clip.id, x: event.clientX, y: event.clientY }); }}
        maxDurationMs={timelineClipDurationLimit(snapshot, 'audio', clip.id)} onMove={(event) => drag.begin(event, 'audio', clip.id)} onResize={(value) => onResizeAudio(clip.id, value)}>
        <strong>{clip.linkedVideoClipId ? '↔ ' : '♫ '}{nameFor(clip.assetId)}</strong><small>{(clip.durationMs / 1000).toFixed(2)}  {' '}{tUi("с")}</small></TimelineTimeBlock>)}
    </div></div>)}
    {drag.guideMs !== null ? <div className={styles.snapGuide} aria-label={tUi("Клипы выровнены")} style={{ left: 160 + drag.guideMs * scale / 1000 }} /> : null}
    <div className={styles.playheadPlane} style={{ width }}><TimelinePlayhead clockRef={clock} scale={scale} duration={seekDuration} frameRate={snapshot.frameRate ?? 30} onSeek={onSeek} scrub={scrub} /></div>
  </div></div>;
}
