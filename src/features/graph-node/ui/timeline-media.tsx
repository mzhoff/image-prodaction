'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { ChevronLeft, ChevronRight, Download, Images, Loader2, Maximize2, Minimize2, Trash2, Video } from '@prodactionpro/ui-core/icons';
import type { ReactNode } from 'react';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { MAX_TIMELINE_FRAMES_PER_SHOT, MAX_TIMELINE_SHOTS, type TimelineAnalysis, type TimelineShot } from '@/shared/media/timeline-contracts';
import { mergeTimelineShots, moveTimelineFrame, selectTimelineFrames, setTimelineShotEnd, setTimelineShotStart, splitTimelineShot } from '@/shared/media/timeline-editing';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { timelineFrameUrl } from '../api/timeline-api';
import { formatTimelineTime } from '../model/timeline-node-values';
import { useTimelineClipDownload } from '../model/use-timeline-clip-download';
import { useTimelinePlayback } from '../model/use-timeline-playback';
import { TimelineFrameRail } from './timeline-frame-rail';
import { TimelineToolbar } from './timeline-toolbar';
import './timeline-media.css';

export interface TimelineMediaProps {
  analysis: TimelineAnalysis; shot: TimelineShot; workspaceId: string; disabled: boolean;
  nodeId?: string; onSelectShot?: (index: number) => void; onFullscreen?: () => void; fullscreen?: boolean;
  framesSidePort?: ReactNode;
  previewMode: 'video' | 'image'; onPreviewMode: (mode: 'video' | 'image') => void;
  onEdit: (change: (analysis: TimelineAnalysis) => TimelineAnalysis) => void;
}

export function TimelineMedia({ analysis, shot, workspaceId, disabled, nodeId, onSelectShot, onFullscreen, fullscreen,
  previewMode, onPreviewMode, onEdit, framesSidePort }: TimelineMediaProps) {
  const tUi = useTranslations();
  const playback = useTimelinePlayback({ analysis, shot, nodeId, previewMode, onPreviewMode });
  const { time, frames, playing, stillTime, seek, pause } = playback;
  const clip = useTimelineClipDownload(workspaceId, analysis.sourceAssetId, shot.startMs, shot.endMs);
  const index = Math.max(0, frames.indexOf(time));
  const shotIndex = analysis.shots.findIndex((item) => item.id === shot.id);
  const frameUrl = (value: number) => {
    const assetId = shot.frames.find((frame) => frame.timeMs === value)?.assetId;
    return assetId ? getRemoteAssetContentUrl(assetId) : timelineFrameUrl(workspaceId, analysis.sourceAssetId, value);
  };
  const edit = (change: (current: TimelineAnalysis) => TimelineAnalysis) => { if (!disabled) { pause(); onEdit(change); } };
  const canCut = time > shot.startMs && time < shot.endMs;
  const canAddCut = canCut && analysis.shots.length < MAX_TIMELINE_SHOTS;
  const chooseShot = (direction: -1 | 1) => { pause(); onSelectShot?.(shotIndex + direction); };

  return <div className="timeline-editor-media" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
    <div className="timeline-editor-preview">
      <video ref={playback.player} src={getRemoteAssetContentUrl(analysis.sourceAssetId)} playsInline preload="metadata"
        className={previewMode === 'image' ? 'timeline-editor-video-hidden' : undefined}
        {...playback.videoProps} aria-label="Selected shot video" />
      {!playing || previewMode === 'image' ? <img className="timeline-editor-exact-frame" src={frameUrl(stillTime)} alt={`Frame at ${formatTimelineTime(stillTime)}`} aria-busy={stillTime !== time} draggable={false} /> : null}
      <div className="timeline-editor-overlay-top">
        <IconButton size="xs" icon={previewMode === 'video' ? <Images /> : <Video />} aria-label={previewMode === 'video' ? 'Show still frames' : 'Show video'} title={previewMode === 'video' ? 'Still frame mode' : 'Video mode'}
          onClick={() => { pause(); onPreviewMode(previewMode === 'video' ? 'image' : 'video'); }} />
        <div className="timeline-editor-overlay-actions">
          <IconButton size="xs" icon={clip.busy ? <Loader2 className="spin" /> : <Download />} aria-label="Download current shot" title="Download only this bounded shot" disabled={clip.busy} onClick={() => void clip.download()} />
          {onFullscreen ? <IconButton size="xs" icon={fullscreen ? <Minimize2 /> : <Maximize2 />} aria-label={fullscreen ? 'Close timeline fullscreen' : 'Open timeline fullscreen'} onClick={() => { pause(); onFullscreen(); }} /> : null}
        </div>
      </div>
      <div className="timeline-editor-overlay-bottom">
        <IconButton size="xs" icon={<ChevronLeft />} aria-label="Previous shot" disabled={!onSelectShot || analysis.shots.length <= 1} onClick={() => chooseShot(-1)} />
        <output aria-label="Selected shot">{shotIndex + 1}/{analysis.shots.length}</output>
        <IconButton size="xs" icon={<ChevronRight />} aria-label="Next shot" disabled={!onSelectShot || analysis.shots.length <= 1} onClick={() => chooseShot(1)} />
      </div>
    </div>
    {playback.mediaError ? <p className="timeline-editor-feedback" role="status">{tUi("Не удалось воспроизвести видео в этом браузере. Стоп-кадры доступны для просмотра.")}</p> : null}
    {clip.busy || clip.error ? <p className="timeline-editor-feedback" role={clip.error ? 'alert' : 'status'}>{clip.error || tUi("Готовим фрагмент для скачивания…")}</p> : null}
    <TimelineToolbar time={time} duration={shot.endMs - shot.startMs} playing={playing} disabled={disabled}
      atStart={index === 0} atEnd={index >= frames.length - 1} canSplit={canAddCut}
      canSetStart={canCut && (shotIndex > 0 || canAddCut)} canSetEnd={canCut && (shotIndex < analysis.shots.length - 1 || canAddCut)}
      canMerge={shotIndex < analysis.shots.length - 1}
      canAddFrame={shot.frames.length < MAX_TIMELINE_FRAMES_PER_SHOT && !shot.frames.some((frame) => frame.timeMs === time)}
      onPlay={() => void playback.toggle()} onPrevious={() => seek(frames[Math.max(0, index - 1)]!)} onNext={() => seek(frames[Math.min(frames.length - 1, index + 1)]!)}
      onStart={() => seek(frames[0]!)} onEnd={() => seek(frames.at(-1)!)}
      onSetStart={() => edit((current) => setTimelineShotStart(current, shot.id, time, crypto.randomUUID()))}
      onSetEnd={() => edit((current) => setTimelineShotEnd(current, shot.id, time, crypto.randomUUID()))}
      onSplit={() => edit((current) => splitTimelineShot(current, shot.id, time, crypto.randomUUID()))}
      onMerge={() => edit((current) => mergeTimelineShots(current, shot.id))}
      onAddFrame={() => edit((current) => { const latest = current.shots.find((item) => item.id === shot.id); return latest ? selectTimelineFrames(current, shot.id, [...latest.frames.map((frame) => frame.timeMs), time]) : current; })} />
    <TimelineFrameRail shot={shot} frames={frames} time={time} disabled={disabled} onSeek={seek} onPause={pause}
      onMove={(originalTime, next) => edit((current) => { const latest = current.shots.find((item) => item.id === shot.id); const selected = latest?.frames.findIndex((frame) => frame.timeMs === originalTime) ?? -1; return selected >= 0 ? moveTimelineFrame(current, shot.id, selected, next) : current; })} />
    <CollapsibleSection title={tUi("Стоп-кадры")} className="text-node-section timeline-editor-frames-section" sidePort={framesSidePort}>
      <div className="timeline-editor-frames" aria-label="Selected still frames">
        {shot.frames.map((frame, frameIndex) => <div key={frame.timeMs} className="timeline-editor-frame" data-active={frame.timeMs === time}>
          <button type="button" className="timeline-editor-frame-select" aria-label={`Preview selected frame ${frameIndex + 1} at ${formatTimelineTime(frame.timeMs)}`} aria-pressed={frame.timeMs === time} onClick={() => seek(frame.timeMs)}>
            <img loading="lazy" src={frameUrl(frame.timeMs)} alt="" draggable={false} /><span>{formatTimelineTime(frame.timeMs)}</span>
          </button>
          <IconButton size="2xs" icon={<Trash2 />} className="timeline-editor-frame-remove" aria-label={`Remove selected frame ${frameIndex + 1}`} disabled={disabled || shot.frames.length <= 1}
            onClick={() => edit((current) => { const latest = current.shots.find((item) => item.id === shot.id); return latest ? selectTimelineFrames(current, shot.id, latest.frames.filter((item) => item.timeMs !== frame.timeMs).map((item) => item.timeMs)) : current; })} />
        </div>)}
      </div>
    </CollapsibleSection>
  </div>;
}
