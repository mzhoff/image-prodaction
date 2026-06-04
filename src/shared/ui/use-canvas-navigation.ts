'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasViewport {
  pan: CanvasPoint;
  zoom: number;
}

interface UseCanvasNavigationOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomSensitivity?: number;
  scrollPanSpeed?: number;
  initialPan?: CanvasPoint;
  initialZoom?: number;
}

const DEFAULT_MIN_ZOOM = 0.1;
const DEFAULT_MAX_ZOOM = 2.4;
const DEFAULT_ZOOM_SENSITIVITY = 0.001;
const DEFAULT_SCROLL_PAN_SPEED = 1.3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(current) : action;
}

export function useCanvasNavigation({
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  zoomSensitivity = DEFAULT_ZOOM_SENSITIVITY,
  scrollPanSpeed = DEFAULT_SCROLL_PAN_SPEED,
  initialPan = { x: 445, y: 250 },
  initialZoom = 0.58,
}: UseCanvasNavigationOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPanState] = useState<CanvasPoint>(initialPan);
  const [zoom, setZoomState] = useState(() => clamp(initialZoom, minZoom, maxZoom));
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const middlePanRef = useRef({
    active: false,
    pointerId: null as number | null,
    startClientX: 0,
    startClientY: 0,
    startPan: initialPan,
  });

  const setPan = useCallback((action: SetStateAction<CanvasPoint>) => {
    const nextPan = resolveStateAction(action, panRef.current);
    panRef.current = nextPan;
    setPanState(nextPan);
  }, []);

  const setZoom = useCallback((action: SetStateAction<number>) => {
    const nextZoom = clamp(resolveStateAction(action, zoomRef.current), minZoom, maxZoom);
    zoomRef.current = nextZoom;
    setZoomState(nextZoom);
  }, [maxZoom, minZoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const screenToWorld = useCallback((point: Pick<MouseEvent | PointerEvent, 'clientX' | 'clientY'>) => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    return {
      x: (point.clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (point.clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const zoomToBounds = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 96) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const nextZoom = clamp(
      Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height, 1.15),
      minZoom,
      maxZoom,
    );

    setZoom(nextZoom);
    setPan({
      x: (rect.width - width * nextZoom) / 2 - bounds.minX * nextZoom,
      y: (rect.height - height * nextZoom) / 2 - bounds.minY * nextZoom,
    });
  }, [maxZoom, minZoom, setPan, setZoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const stopPanning = (event?: PointerEvent) => {
      const state = middlePanRef.current;
      if (!state.active) return;
      if (event && state.pointerId !== event.pointerId) return;
      event?.preventDefault();
      event?.stopPropagation();

      if (state.pointerId !== null && container.hasPointerCapture(state.pointerId)) {
        container.releasePointerCapture(state.pointerId);
      }

      middlePanRef.current = {
        active: false,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        startPan: panRef.current,
      };
      setIsPanning(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();

      middlePanRef.current = {
        active: true,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPan: panRef.current,
      };
      container.setPointerCapture(event.pointerId);
      setIsPanning(true);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = middlePanRef.current;
      if (!state.active || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();

      setPan({
        x: state.startPan.x + event.clientX - state.startClientX,
        y: state.startPan.y + event.clientY - state.startClientY,
      });
    };

    const handleWheel = (event: WheelEvent) => {
      if (shouldLetTextareaHandleWheel(event)) return;

      event.preventDefault();
      if (middlePanRef.current.active) return;

      if (event.ctrlKey || event.metaKey) {
        const rect = container.getBoundingClientRect();
        const currentZoom = zoomRef.current;
        const nextZoom = clamp(currentZoom * (1 - event.deltaY * zoomSensitivity), minZoom, maxZoom);
        const worldX = (event.clientX - rect.left - panRef.current.x) / currentZoom;
        const worldY = (event.clientY - rect.top - panRef.current.y) / currentZoom;

        setZoom(nextZoom);
        setPan({
          x: event.clientX - rect.left - worldX * nextZoom,
          y: event.clientY - rect.top - worldY * nextZoom,
        });
        return;
      }

      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const dx = (event.deltaX !== 0 ? event.deltaX : event.deltaY) * scrollPanSpeed;
        setPan((current) => ({ ...current, x: current.x - dx }));
        return;
      }

      setPan((current) => ({ ...current, y: current.y - event.deltaY * scrollPanSpeed }));
    };

    const handleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener('pointerdown', handlePointerDown, true);
    container.addEventListener('pointermove', handlePointerMove, true);
    container.addEventListener('pointerup', stopPanning, true);
    container.addEventListener('pointercancel', stopPanning, true);
    container.addEventListener('lostpointercapture', stopPanning);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('auxclick', handleAuxClick, true);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown, true);
      container.removeEventListener('pointermove', handlePointerMove, true);
      container.removeEventListener('pointerup', stopPanning, true);
      container.removeEventListener('pointercancel', stopPanning, true);
      container.removeEventListener('lostpointercapture', stopPanning);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('auxclick', handleAuxClick, true);
    };
  }, [maxZoom, minZoom, scrollPanSpeed, setPan, setZoom, zoomSensitivity]);

  return {
    containerRef,
    pan,
    zoom,
    isPanning,
    panRef,
    zoomRef,
    setPan,
    setZoom,
    screenToWorld,
    zoomToBounds,
  };
}

function shouldLetTextareaHandleWheel(event: WheelEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return false;

  const textarea = target.closest('textarea.prompt-box');
  if (!(textarea instanceof HTMLTextAreaElement)) return false;

  return textarea.scrollHeight > textarea.clientHeight || textarea.scrollWidth > textarea.clientWidth;
}
