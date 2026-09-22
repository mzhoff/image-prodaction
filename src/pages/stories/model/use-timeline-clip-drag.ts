'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { timelineClipLane } from '@/modules/story-projects/core/timeline-linked-clips';
import { placeTimelineClip } from '@/modules/story-projects/core/timeline-placement';
import { timelineVideoPositions } from '@/modules/story-projects/core/timeline-video';
import { snapTimelineClip } from '@/modules/story-projects/core/timeline-snapping';

export type TimelineClipDragStart = (event: PointerEvent, kind: 'video' | 'audio', id: string) => void;

/** Live local preview; release commits exactly one history entry. No HTML drag ghost. */
export function useTimelineClipDrag({ snapshot, scale, snapping, scroll, onChange, onSelect, onError }: {
  snapshot: TimelineSnapshot; scale: number; snapping: boolean; scroll: RefObject<HTMLDivElement | null>;
  onChange(next: TimelineSnapshot): void; onSelect(kind: 'video' | 'audio', id: string): void; onError(message: string): void;
}) {
  const tUi = useTranslations();
  const [preview, setPreview] = useState<{ base: TimelineSnapshot; value: TimelineSnapshot; guideMs: number | null; id: string } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [snapshot]);
  const begin: TimelineClipDragStart = (event, kind, id) => {
    if (event.button !== 0) return;
    event.preventDefault(); cleanup.current?.();
    const container = scroll.current, ruler = container?.querySelector<HTMLElement>('[data-timeline-ruler]');
    const clip = kind === 'video' ? timelineVideoPositions(snapshot).find((item) => item.id === id) : snapshot.audioClips?.find((item) => item.id === id);
    if (!container || !ruler || !clip) return;
    const offset = (event.clientX - ruler.getBoundingClientRect().left) * 1000 / scale - clip.startMs;
    const originX = event.clientX, originY = event.clientY;
    let next = snapshot, moved = false, invalid = '', pointerX = event.clientX, pointerY = event.clientY, frame = 0;
    onSelect(kind, id); onError('');
    const update = () => {
      if (!moved) return;
      const lanes = [...container.querySelectorAll<HTMLElement>(`[data-clip-lane="${kind}"]`)];
      const lane = lanes.find((element) => { const box = element.getBoundingClientRect(); return pointerY >= box.top + 4 && pointerY <= box.bottom - 4; });
      const trackId = lane?.dataset.trackId ?? timelineClipLane(next, kind, id);
      const at = (pointerX - ruler.getBoundingClientRect().left) * 1000 / scale - offset;
      const snap = snapTimelineClip(snapshot, kind, id, at, scale, snapping);
      try {
        const placed = placeTimelineClip(snapshot, kind, id, trackId, snap.startMs, next);
        invalid = '';
        if (placed) next = placed.snapshot;
        const aligned = placed && snapTimelineClip(snapshot, kind, id, placed.startMs, scale, snapping);
        setPreview({ base: snapshot, value: next, guideMs: aligned && aligned.startMs === placed!.startMs ? aligned.guideMs : null, id });
      } catch (error) { invalid = error instanceof Error ? error.message : tUi("Здесь недостаточно места."); setPreview({ base: snapshot, value: next, guideMs: null, id }); }
    };
    const autoScroll = () => {
      if (moved) {
        const box = container.getBoundingClientRect();
        const dx = pointerX > box.right - 32 ? 12 : pointerX < box.left + 190 ? -12 : 0;
        const dy = pointerY > box.bottom - 24 ? 8 : pointerY < box.top + 24 ? -8 : 0;
        const x = container.scrollLeft, y = container.scrollTop;
        container.scrollBy(dx, dy);
        if (x !== container.scrollLeft || y !== container.scrollTop) update();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      pointerX = e.clientX; pointerY = e.clientY;
      moved ||= Math.hypot(pointerX - originX, pointerY - originY) > 3;
      update();
    };
    const clean = () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); cleanup.current = null; };
    const cancel = () => { clean(); setPreview(null); };
    const finish = (e: globalThis.PointerEvent) => { if (e.pointerId !== event.pointerId) return; clean(); setPreview(null); if (moved && next !== snapshot) onChange(next); if (invalid) onError(invalid); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
    cleanup.current = clean;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    frame = requestAnimationFrame(autoScroll);
  };
  const active = preview?.base === snapshot ? preview : null;
  return { begin, snapshot: active?.value ?? snapshot, guideMs: active?.guideMs ?? null, draggingId: active?.id };
}
