'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { timelineClipDurationLimit } from '@/modules/story-projects/core/timeline-placement';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { timelineVideoLanes, timelineVideoPositions, PRIMARY_VIDEO_TRACK } from '@/modules/story-projects/core/timeline-video';
import { TimelineTimeBlock } from './timeline-time-block';
import type { TimelineClipDragStart } from '../model/use-timeline-clip-drag';
import type { ClipMenuTarget } from '../model/timeline-selection';
import { timeLabel, type TimelineSelection } from '../model/timeline-selection';
import styles from './timeline-workspace.module.css';

export function TimelineVideoLanes({ snapshot, onMove, scale, width, playing, selection, onSelect, onChange, onResize, onAssetDrop, nameFor, onContextMenu }: {
  snapshot: TimelineSnapshot; onMove: TimelineClipDragStart; scale: number; width: number; playing: boolean; selection: TimelineSelection;
  onSelect(selection: TimelineSelection): void; onChange(snapshot: TimelineSnapshot): void; onResize(id: string, value: number): void;
  onAssetDrop(id: string, track: string, at: number): void; nameFor(id: string): string; onContextMenu(target: ClipMenuTarget): void;
}) {
  const tUi = useTranslations();
  const lanes = timelineVideoLanes(snapshot), positions = timelineVideoPositions(snapshot);
  function order(id: string, direction: number) {
    const tracks = [...(snapshot.videoTracks ?? [])], index = tracks.findIndex((track) => track.id === id), to = index + direction;
    if (to < 0 || to >= tracks.length) return; const [track] = tracks.splice(index, 1); tracks.splice(to, 0, track); onChange({ ...snapshot, videoTracks: tracks });
  }
  return [...lanes].reverse().map((track) => { const clips = positions.filter((clip) => (clip.trackId ?? PRIMARY_VIDEO_TRACK) === track.id), primary = track.id === PRIMARY_VIDEO_TRACK;
    return <div key={track.id} className={styles.trackRow} data-video-track={track.id}><div className={styles.trackLabel}>
      {primary ? <><strong>{tUi("Видео")}</strong><small>{tUi("Кадры и изображения")}</small></> : <><button type="button" aria-label={tUi("Настроить дорожку {p1}", { p1: track.name })} onClick={() => onSelect({ kind: 'videoTrack', id: track.id })}>{track.name}</button><div>
        <button type="button" aria-label={tUi("Поднять дорожку {p1}", { p1: track.name })} disabled={playing || lanes.at(-1)?.id === track.id} onClick={() => order(track.id, 1)}>↑</button>
        <button type="button" aria-label={tUi("Опустить дорожку {p1}", { p1: track.name })} disabled={playing || lanes[1]?.id === track.id} onClick={() => order(track.id, -1)}>↓</button></div></>}
    </div><div className={styles.lane} data-clip-lane="video" data-track-id={track.id} style={{ width }} onDragOver={(event) => { if (!playing) event.preventDefault(); }} onDrop={(event) => {
      if (playing) return; event.preventDefault(); const at = Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) * 1000 / scale);
      const asset = event.dataTransfer.getData('application/x-timeline-asset'); if (asset) { onAssetDrop(asset, track.id, at); return; }
    }}>
      {clips.map((clip, index) => <TimelineTimeBlock key={clip.id} startMs={clip.startMs} durationMs={clip.durationMs} scale={scale} label={tUi("Клип {p1}, {p2}", { p1: index + 1, p2: timeLabel(clip.durationMs) })} selected={selection?.kind === 'video' && selection.id === clip.id} tone="video" disabled={playing} onSelect={() => onSelect({ kind: 'video', id: clip.id })}
        onContextMenu={(event) => { event.preventDefault(); onContextMenu({ kind: 'video', id: clip.id, x: event.clientX, y: event.clientY }); }}
        onMove={(event) => onMove(event, 'video', clip.id)} onResize={(value) => onResize(clip.id, value)} maxDurationMs={timelineClipDurationLimit(snapshot, 'video', clip.id)}>
        <strong>{snapshot.audioClips?.some((audio) => audio.linkedVideoClipId === clip.id) ? '↔ ' : ''}{snapshot.lockedClipIds?.includes(clip.id) ? '◆ ' : ''}{index + 1} · {nameFor(clip.assetId)}</strong><small>{(clip.durationMs / 1000).toFixed(2)}  {' '}{tUi("с")}</small>
      </TimelineTimeBlock>)}
      {!clips.length ? <span className={styles.laneEmpty}>{tUi("Перетащите видео или изображение из библиотеки")}</span> : null}
    </div></div>;
  });
}
