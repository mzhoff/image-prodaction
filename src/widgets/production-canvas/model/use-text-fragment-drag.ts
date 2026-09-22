'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type { TextFragmentSource } from '@/entities/production-graph/model/text-fragments';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { TextFragmentPreview } from '@/features/graph-node/ui/text-fragment-drag-preview';
import { eventElement, FRAGMENT_HANDLE, getFragmentDragSource, resolveFragmentDrop } from '../lib/text-fragment-drag-target';

const MIME = 'application/x-image-production-text-fragment';
type Point = { clientX: number; clientY: number; altKey: boolean };
type Options = { projectId?: string; containerRef: RefObject<HTMLDivElement | null>; screenToWorld: (point: { clientX: number; clientY: number }) => { x: number; y: number } | null; notify: (text: string) => void };

export function useTextFragmentDrag(options: Options) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const latest = useRef(options);
  latest.current = options;
  const [preview, setPreview] = useState<TextFragmentPreview | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const canvas = latest.current.containerRef.current;
    if (!canvas) return;
    let source: TextFragmentSource | null = null;
    let pending: { element: HTMLElement; point: Point; pointerId: number } | null = null;
    let native = false;
    let active: HTMLElement | null = null;
    let transparent: HTMLCanvasElement | null = null;
    let suppressNativeDelete = false;
    let suppressClick: { element: HTMLElement; until: number } | null = null;
    let zoom = 1;
    let frame = 0;
    const origin = (point: Point) => ({ clientX: point.clientX - 24 * zoom, clientY: point.clientY - 60 * zoom });
    const resolve = (point: Point) => source ? resolveFragmentDrop(canvas, document.elementFromPoint(point.clientX, point.clientY), source,
      latest.current.screenToWorld(origin(point))) : null;
    const renderMove = (point: Point) => {
      const location = origin(point);
      if (previewRef.current) previewRef.current.style.transform = `translate3d(${location.clientX}px, ${location.clientY}px, 0)`;
      const drop = resolve(point);
      if (active !== drop?.element) { active?.removeAttribute('data-text-drop-active'); active = drop?.element ?? null; active?.setAttribute('data-text-drop-active', ''); }
      if (hintRef.current) hintRef.current.textContent = !drop ? tEffect("Здесь нельзя сбросить текст")
        : `${source?.copyOnly || point.altKey ? tEffect("Копия · ") : ''}${'nodeId' in drop.target ? tEffect("Добавить текст в поле") : tEffect("Создать Prompt")}`;
    };
    const move = (point: Point) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; renderMove(point); });
    };
    const cleanup = () => {
      cancelAnimationFrame(frame); frame = 0;
      active?.removeAttribute('data-text-drop-active'); active = null;
      transparent?.remove(); transparent = null;
      source = null; pending = null; native = false;
      setPreview(null);
    };
    const begin = (element: Element, point: Point) => {
      source = getFragmentDragSource(element);
      if (!source) return false;
      const card = element.closest<HTMLElement>('[data-node-id]');
      const node = useProductionGraphStore.getState().nodes.find((item) => item.id === source!.nodeId);
      zoom = card && node ? card.getBoundingClientRect().width / node.size.width : 1;
      const location = origin(point);
      // Один React-render при начале. Движение, как у карточек, — только transform в rAF.
      flushSync(() => setPreview({ text: source!.expectedValue.slice(source!.start, source!.end), zoom,
        width: createDefaultNode('textPrompt', { x: 0, y: 0 }).size.width, x: location.clientX, y: location.clientY }));
      renderMove(point);
      return true;
    };
    const commit = (point: Point) => {
      const payload = source;
      const drop = resolve(point);
      cleanup();
      if (!payload || !drop) return;
      const outcome = useProductionGraphStore.getState().dropTextFragment(payload, drop.target, point.altKey);
      if (outcome.ok) canvas.focus({ preventScroll: true });
      latest.current.notify(outcome.ok ? tEffect("Готово. Отменить: ⌘Z / Ctrl+Z.") : outcome.reason);
    };
    const pointerDown = (event: PointerEvent) => {
      const handle = eventElement(event)?.closest<HTMLElement>(FRAGMENT_HANDLE);
      if (event.button !== 0 || !event.isPrimary || !handle) return;
      event.stopPropagation();
      pending = { element: handle, point: event, pointerId: event.pointerId };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pending || native || event.pointerId !== pending.pointerId) return;
      if (!source && Math.hypot(event.clientX - pending.point.clientX, event.clientY - pending.point.clientY) < 4) return;
      if (!source && !begin(pending.element, event)) { pending = null; return; }
      event.preventDefault(); event.stopPropagation();
      suppressClick = { element: pending.element, until: performance.now() + 500 };
      move(event);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!pending || native || event.pointerId !== pending.pointerId) return;
      if (source) {
        suppressClick = { element: pending.element, until: performance.now() + 500 };
        event.preventDefault(); event.stopPropagation(); commit(event);
      }
      else pending = null;
    };
    const start = (event: DragEvent) => {
      const element = eventElement(event);
      if (!element || !event.dataTransfer || !begin(element, event)) return;
      pending = null; native = true; suppressNativeDelete = true;
      event.stopPropagation();
      event.dataTransfer.effectAllowed = source!.copyOnly ? 'copy' : 'copyMove';
      event.dataTransfer.setData(MIME, '1');
      event.dataTransfer.setData('text/plain', source!.expectedValue.slice(source!.start, source!.end));
      // Выделение остаётся нативным, но полупрозрачная системная картинка скрыта.
      transparent = document.createElement('canvas'); transparent.width = transparent.height = 1;
      transparent.style.cssText = 'position:fixed;pointer-events:none;left:0;top:0'; document.body.append(transparent);
      event.dataTransfer.setDragImage(transparent, 0, 0);
    };
    const over = (event: DragEvent) => {
      if (!source || !native || !event.dataTransfer) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = resolve(event) ? source.copyOnly || event.altKey ? 'copy' : 'move' : 'none';
      move(event);
    };
    const drop = (event: DragEvent) => {
      if (!source || !native) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      commit(event);
    };
    const end = () => { cleanup(); window.setTimeout(() => { suppressNativeDelete = false; }, 0); };
    const cancelPointer = () => { if (!native) end(); };
    const click = (event: MouseEvent) => {
      if (suppressClick && performance.now() < suppressClick.until && suppressClick.element.contains(event.target as Node)) {
        event.preventDefault(); event.stopImmediatePropagation(); suppressClick = null;
      }
    };
    const beforeInput = (event: InputEvent) => { if (suppressNativeDelete && event.inputType === 'deleteByDrag') { event.preventDefault(); event.stopImmediatePropagation(); } };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && (source || pending)) { event.preventDefault(); event.stopPropagation(); end(); } };
    canvas.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointermove', pointerMove, { passive: false }); window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', cancelPointer); window.addEventListener('blur', end);
    canvas.addEventListener('dragstart', start, true);
    document.addEventListener('dragover', over, true); document.addEventListener('drop', drop, true);
    canvas.addEventListener('click', click, true);
    document.addEventListener('dragend', end, true); document.addEventListener('beforeinput', beforeInput, true); document.addEventListener('keydown', key, true);
    return () => {
      cleanup();
      canvas.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', cancelPointer); window.removeEventListener('blur', end);
      canvas.removeEventListener('dragstart', start, true);
      document.removeEventListener('dragover', over, true); document.removeEventListener('drop', drop, true); canvas.removeEventListener('click', click, true);
      document.removeEventListener('dragend', end, true); document.removeEventListener('beforeinput', beforeInput, true); document.removeEventListener('keydown', key, true);
    };
  }, [options.projectId]);
  return { preview, previewRef, hintRef };
}
