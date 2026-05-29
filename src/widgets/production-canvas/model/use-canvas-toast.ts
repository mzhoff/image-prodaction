'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useCanvasToast() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setToastMessage(message);
    timeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      timeoutRef.current = null;
    }, 2800);
  }, []);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return { showToast, toastMessage };
}
