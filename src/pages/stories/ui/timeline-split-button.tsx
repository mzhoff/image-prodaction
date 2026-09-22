'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useState, type RefObject } from 'react';
import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { Scissors } from '@prodactionpro/ui-core/icons';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { timelineVideoPositions } from '@/modules/story-projects/core/timeline-video';
import type { TimelineSelection } from '../model/timeline-selection';

export function useCanSplit(snapshot: TimelineSnapshot, selection: TimelineSelection, clock: RefObject<{ timeMs: number }>) {
  const [at, setAt] = useState(0);
  useEffect(() => { let frame = 0; const tick = () => { setAt(Math.round(clock.current.timeMs)); frame = requestAnimationFrame(tick); }; tick(); return () => cancelAnimationFrame(frame); }, [clock]);
  const clip = selection?.kind === 'video' ? timelineVideoPositions(snapshot).find((clip) => clip.id === selection.id) : selection?.kind === 'audio' ? snapshot.audioClips?.find((clip) => clip.id === selection.id) : undefined;
  const cut = Math.round(Math.round(at * (snapshot.frameRate ?? 30) / 1000) * 1000 / (snapshot.frameRate ?? 30));
  return Boolean(clip && cut - clip.startMs >= 100 && clip.startMs + clip.durationMs - cut >= 100 && (selection?.kind !== 'audio' || (snapshot.audioClips?.length ?? 0) < 32) && (selection?.kind !== 'video' || snapshot.clips.length < 500));
}
export function TimelineSplitButton({ snapshot, selection, clock, disabled, onSplit }: {
  snapshot: TimelineSnapshot; selection: TimelineSelection; clock: RefObject<{ timeMs: number }>; disabled: boolean; onSplit(kind: 'video' | 'audio', id: string): void;
}) {
  const tUi = useTranslations();
  const canSplit = useCanSplit(snapshot, selection, clock);
  return <IconButton icon={<Scissors />} size="xs" aria-label={tUi("Разрезать по игле")} title={tUi("Разрезать выбранный клип по игле")} disabled={disabled || !canSplit} onClick={() => { if (selection?.kind === 'video' || selection?.kind === 'audio') onSplit(selection.kind, selection.id); }} />;
}
