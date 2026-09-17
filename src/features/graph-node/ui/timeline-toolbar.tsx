'use client';

import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { ChevronLeft, ChevronRight, Eraser, ImagePlus, Pause, Play, Scissors } from '@prodactionpro/ui-core/icons';
import { formatTimelineTime } from '../model/timeline-node-values';

function FigmaIcon({ name }: { name: 'shot-start' | 'shot-end' | 'set-start' | 'set-end' }) {
  return <img src={`/figma/timeline-handoff/${name}.svg`} width={14} height={14} alt="" aria-hidden />;
}

export function TimelineToolbar({ time, duration, playing, disabled, atStart, atEnd, canSetStart, canSetEnd, canSplit, canMerge, canAddFrame,
  onPlay, onPrevious, onNext, onStart, onEnd, onSetStart, onSetEnd, onSplit, onMerge, onAddFrame }: {
  time: number; duration: number; playing: boolean; disabled: boolean; atStart: boolean; atEnd: boolean;
  canSetStart: boolean; canSetEnd: boolean; canSplit: boolean; canMerge: boolean; canAddFrame: boolean;
  onPlay: () => void; onPrevious: () => void; onNext: () => void; onStart: () => void; onEnd: () => void;
  onSetStart: () => void; onSetEnd: () => void; onSplit: () => void; onMerge: () => void; onAddFrame: () => void;
}) {
  const formatted = formatTimelineTime(time);
  return <div className="timeline-editor-toolbar" role="toolbar" aria-label="Shot playback and editing">
    <IconButton size="xs" appearance="solid" intent="neutral" icon={playing ? <Pause /> : <Play />} aria-label={playing ? 'Pause shot' : 'Play shot'} title={playing ? 'Pause · Space' : 'Loop this shot · Space'} onClick={onPlay} />
    <output className="timeline-editor-clock" aria-label={`Current time ${formatted}; shot duration ${(duration / 1000).toFixed(2)} seconds`}>
      <strong>{formatted.slice(0, 5)}<span>{formatted.slice(5, 7)}</span></strong><small>{(duration / 1000).toFixed(2)} s</small>
    </output>
    <IconButton size="xs" icon={<ChevronLeft />} aria-label="Previous frame" title="Previous decoded frame" disabled={atStart} onClick={onPrevious} />
    <IconButton size="xs" icon={<FigmaIcon name="shot-start" />} aria-label="Go to shot start" title="Start of this shot" disabled={atStart} onClick={onStart} />
    <IconButton size="xs" appearance="soft" icon={<FigmaIcon name="set-start" />} aria-label="Set shot start here" title="Set start at this frame" disabled={disabled || !canSetStart} onClick={onSetStart} />
    <IconButton size="xs" appearance="soft" icon={<FigmaIcon name="set-end" />} aria-label="Set shot end here" title="Set end at this frame" disabled={disabled || !canSetEnd} onClick={onSetEnd} />
    <IconButton size="xs" appearance="soft" icon={<Scissors />} aria-label="Split shot here" title="Add cut at this frame" disabled={disabled || !canSplit} onClick={onSplit} />
    <IconButton size="xs" appearance="soft" icon={<Eraser />} aria-label="Merge with next shot" title="Remove the next cut" disabled={disabled || !canMerge} onClick={onMerge} />
    <IconButton size="xs" appearance="soft" icon={<ImagePlus />} aria-label="Use current frame" title="Add this still for the description" disabled={disabled || !canAddFrame} onClick={onAddFrame} />
    <IconButton size="xs" icon={<FigmaIcon name="shot-end" />} aria-label="Go to shot end" title="Last decoded frame of this shot" disabled={atEnd} onClick={onEnd} />
    <IconButton size="xs" icon={<ChevronRight />} aria-label="Next frame" title="Next decoded frame" disabled={atEnd} onClick={onNext} />
  </div>;
}
