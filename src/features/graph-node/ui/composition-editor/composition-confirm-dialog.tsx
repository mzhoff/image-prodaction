'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

export function CompositionConfirmDialog({
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm]);

  return (
    <div className="composition-confirm-backdrop" onClick={onCancel} role="presentation">
      <section className="composition-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="composition-confirm-title" onClick={(event) => event.stopPropagation()}>
        <header className="composition-confirm-header">
          <h3 id="composition-confirm-title">{title}</h3>
          <button type="button" className="composition-confirm-close" aria-label="Close" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>
        <p>{message}</p>
        <footer className="composition-confirm-actions">
          <button type="button" className="composition-confirm-secondary" onClick={onCancel}>Отмена</button>
          <button type="button" className="composition-confirm-primary" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}
