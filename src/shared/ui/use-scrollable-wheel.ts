'use client';

import { useCallback, type WheelEvent as ReactWheelEvent } from 'react';

export function useScrollableWheel<T extends HTMLElement>() {
  return useCallback((event: ReactWheelEvent<T>) => {
    handleScrollableWheel(event);
  }, []);
}

export function handleScrollableWheel<T extends HTMLElement>(event: ReactWheelEvent<T>) {
  const element = event.currentTarget;
  if (!hasScrollableOverflow(element)) return false;

  event.preventDefault();
  event.stopPropagation();

  const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? element.clientHeight
      : 1;
  const deltaY = event.deltaY * scale;
  const deltaX = event.deltaX * scale;
  const canScrollX = element.scrollWidth > element.clientWidth;
  const canScrollY = element.scrollHeight > element.clientHeight;

  if (canScrollX && (event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY))) {
    element.scrollLeft += deltaX || deltaY;
    return true;
  }

  if (canScrollY) element.scrollTop += deltaY;
  return true;
}

export function hasScrollableOverflow(element: HTMLElement) {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}
