'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@prodactionpro/ui-core/icons';
import styles from './video-style-library.module.css';

export function VideoStyleDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return createPortal(<dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header className={styles.header}><h2 id={titleId}>{title}</h2><button type="button" className={styles.iconButton}
      disabled={busy} aria-label={tUi("Закрыть окно стилей")} onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>, document.body);
}
