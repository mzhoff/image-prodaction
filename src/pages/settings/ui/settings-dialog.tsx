'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import type { SettingsSection } from '../model/settings-section';
import { SettingsPanel } from './settings-panel';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function SettingsDialog({ section }: { section: SettingsSection }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [dirty, setDirty] = useState(false);

  const close = useCallback(() => {
    if (dirty && !window.confirm('Есть несохранённые изменения. Закрыть настройки без сохранения?')) {
      return;
    }
    router.back();
  }, [dirty, router]);

  useEffect(() => {
    const appRoot = document.getElementById('app-root');
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');
    document.body.classList.add('settings-dialog-open');

    const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();

    return () => {
      appRoot?.removeAttribute('inert');
      appRoot?.removeAttribute('aria-hidden');
      document.body.classList.remove('settings-dialog-open');
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === overlayRef.current) close();
  }

  return (
    <div className="settings-overlay" ref={overlayRef} onMouseDown={handleOverlayClick}>
      <div
        className="settings-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <SettingsPanel
          section={section}
          presentation="dialog"
          onClose={close}
          onDirtyChange={setDirty}
        />
      </div>
    </div>
  );
}
