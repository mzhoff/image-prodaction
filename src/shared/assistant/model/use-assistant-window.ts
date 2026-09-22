'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantWindowResize } from './use-assistant-window-resize';

/** UI lifecycle only. Closing the window never disposes the chat runtime. */
export function useAssistantWindow(open: boolean, onClose: () => void) {
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const resize = useAssistantWindowResize();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useEffect(() => {
    if (!open) { setExpanded(false); setSettingsOpen(false); }
  }, [open]);
  useEffect(() => {
    if (!settingsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) closeSettings();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); closeSettings();
      settingsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [settingsOpen, closeSettings]);
  const close = () => { setExpanded(false); closeSettings(); onClose(); };
  return { ...resize, expanded, setExpanded, settingsOpen, setSettingsOpen, settingsRef, settingsButtonRef, closeSettings, close };
}
