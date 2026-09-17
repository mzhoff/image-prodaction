'use client';
import { ChevronDown } from '@prodactionpro/ui-core/icons';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { createAspectRatioScale, nearestAvailableRatio, parseAspectRatio } from '@/shared/media/aspect-ratio-scale';
import type { OutputResolution } from '@/shared/media/output-resolution/types';
import { useAspectPopup } from '../model/use-aspect-popup';

export interface AspectRatioSelectorProps {
  value: string;
  availableRatios: readonly string[];
  catalogRatios?: readonly string[];
  onChange: (ratio: string) => void;
  getResolution: (ratio: string) => OutputResolution;
  disabled?: boolean;
}
/** Model-bound discrete ratio control. Crop/custom dimensions deliberately remain separate. */
export function AspectRatioSelector({ value, availableRatios, catalogRatios = [], onChange, getResolution, disabled }: AspectRatioSelectorProps) {
  const scale = useMemo(() => createAspectRatioScale([...catalogRatios, ...availableRatios]), [availableRatios, catalogRatios]);
  const choices = scale.filter((ratio) => availableRatios.includes(ratio));
  const hasAuto = availableRatios.includes('auto');
  const scaleWidth = Math.max(315, (scale.length - 1) * 32 + 24);
  const { trigger, popup, anchor, close, position, open } = useAspectPopup(scaleWidth + 33, 124 + (hasAuto ? 28 : 0));
  const [draft, setDraft] = useState(value);
  const gesture = useRef<{ id: number; startX: number; startY: number; dragged: boolean; value: string } | null>(null);
  const id = useId();
  const selectedIndex = scale.indexOf(draft);
  const supportedSelection = choices.includes(draft);
  const squarePosition = scale.indexOf('1:1') / (scale.length - 1) * 100;
  const selectedPosition = selectedIndex / (scale.length - 1) * 100;
  const previewRatio = parseAspectRatio(draft);
  const resolution = getResolution(draft);
  const commit = (ratio: string, dismiss: boolean) => {
    if (disabled || !availableRatios.includes(ratio)) return;
    if (ratio !== value) onChange(ratio);
    setDraft(ratio);
    if (dismiss) close();
  };
  const atPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return nearestAvailableRatio(scale, choices, (event.clientX - rect.left - 12) / (rect.width - 24));
  };
  const startGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || !event.isPrimary || !choices.length) return;
    event.preventDefault(); event.stopPropagation();
    const next = atPointer(event);
    if (!next) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dragged: false, value: next };
    setDraft(next);
  };
  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 4) active.dragged = true;
    if (!active.dragged) return;
    const next = atPointer(event);
    if (next) { active.value = next; setDraft(next); }
  };
  const finishGesture = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    commit(active.value, !active.dragged);
  };
  const cancelGesture = () => { if (gesture.current) { gesture.current = null; setDraft(value); } };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(draft, true); return; }
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key) || !choices.length) return;
    event.preventDefault(); event.stopPropagation();
    const current = choices.indexOf(draft);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : Math.max(0, Math.min(choices.length - 1, current + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1)));
    commit(choices[next], false);
  };
  return <div className="setting-row">
    <span>Aspect Ratio</span>
    <button ref={trigger} type="button" className="mini-select" data-node-interactive aria-label="Aspect Ratio"
      aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open ? id : undefined}
      disabled={disabled || (!choices.length && !hasAuto)} onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()} onClick={(event) => {
        event.stopPropagation(); if (open) close(); else { setDraft(value); gesture.current = null; position(); }
      }}><span className="mini-select-label">{value === 'auto' ? 'Auto' : value}</span><ChevronDown size={13} /></button>
    {anchor && !disabled && createPortal(<>
      <div className="dark-select-backdrop" data-node-interactive onPointerDown={(event) => { event.stopPropagation(); close(); }} />
      <div ref={popup} id={id} role="dialog" aria-label="Выбор соотношения сторон" className="aspect-ratio-menu"
        data-placement={anchor.placement} data-node-interactive
        style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
        onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()} onBlurCapture={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false);
        }}>
        <div className="aspect-ratio-heading">
          <output className="aspect-ratio-value" aria-live="polite">{draft === 'auto' ? 'Auto' : draft}</output>
          <div className="aspect-ratio-preview-container" aria-hidden="true">
            {previewRatio ? <div className="aspect-ratio-preview" style={{ width: 35 * previewRatio }} /> : <span className="aspect-ratio-auto-preview">Auto</span>}
          </div>
          <output className="aspect-ratio-resolution" title={resolution.description}>{resolution.label}</output>
        </div>
        <div className="aspect-ratio-scroll" data-node-interactive>
          <div className="aspect-ratio-scale" style={{ width: scaleWidth }}>
            <div role="slider" tabIndex={choices.length ? 0 : -1} aria-label="Соотношение сторон" aria-orientation="horizontal"
              aria-valuemin={0} aria-valuemax={scale.length - 1} aria-valuenow={supportedSelection ? selectedIndex : scale.indexOf('1:1')}
              aria-valuetext={`${draft === 'auto' ? 'Автоматически' : draft}. ${resolution.label}`} aria-disabled={!choices.length}
              className="aspect-ratio-slider" onKeyDown={keyboard} onPointerDown={startGesture} onPointerMove={moveGesture}
              onPointerUp={finishGesture} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>
              <div className="aspect-ratio-track">
                {supportedSelection && <>
                  <div className="aspect-ratio-active-range" style={{ left: `${Math.min(squarePosition, selectedPosition)}%`, width: `${Math.abs(squarePosition - selectedPosition)}%` }} />
                  <div className="aspect-ratio-thumb" style={{ left: `${selectedPosition}%` }} />
                </>}
              </div>
            </div>
            <div className="aspect-ratio-labels">
              {choices.map((ratio) => <button type="button" key={ratio} data-aspect-ratio={ratio} aria-pressed={draft === ratio}
                style={{ left: `${scale.indexOf(ratio) / (scale.length - 1) * 100}%` }} onClick={() => commit(ratio, true)}>{ratio}</button>)}
            </div>
          </div>
        </div>
        {hasAuto && <button type="button" className="aspect-ratio-auto" aria-pressed={draft === 'auto'} onClick={() => commit('auto', true)}>Auto</button>}
      </div>
    </>, document.body)}
  </div>;
}
