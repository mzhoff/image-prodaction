'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable handler identity without retaining a previous render's graph or selection. */
export function useEventCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args: Args) => latest.current(...args), []);
}
