'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantNotice } from '@/features/assistant-pet/model/assistant-pet-contract';

export type CanvasToast = AssistantNotice;

export function useCanvasToast() {
  const [toastMessage, setToastMessage] = useState<CanvasToast | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string | CanvasToast) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setToastMessage(typeof message === 'string' ? { title: message, status: 'info' } : message);
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
