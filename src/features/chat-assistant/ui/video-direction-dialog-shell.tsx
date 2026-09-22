'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@prodactionpro/ui-core/icons';
import styles from './video-direction.module.css';

export function VideoDirectionDialogShell({ title, onClose, children, compact = false, busy = false }: {
  title: string; onClose: () => void; children: ReactNode; compact?: boolean; busy?: boolean;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return createPortal(<dialog ref={ref} className={styles.dialog} data-compact={compact} aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <div className={styles.surface}>
      <header className={styles.header}><h2>{title}</h2><button type="button" aria-label={tUi("Закрыть настройки")} disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {children}
    </div>
  </dialog>, document.body);
}
