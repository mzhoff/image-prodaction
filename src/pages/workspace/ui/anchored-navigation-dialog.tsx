'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Native modal: full-window backdrop and focus containment, anchored to its trigger. */
export function AnchoredNavigationDialog({ anchor, placement, width, outset = 0, preserveLogo = false, label, className, onClose, children }: {
  anchor: HTMLElement | null; placement: 'top' | 'bottom'; width: number;
  outset?: number; preserveLogo?: boolean; label: string; className: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const position = () => {
      const rect = anchor?.getBoundingClientRect();
      const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
      const panelWidth = Math.min(width, Math.max(0, viewportWidth - 24));
      const left = Math.max(12, Math.min((rect?.left ?? 12) - outset, viewportWidth - panelWidth - 12));
      const edge = Math.max(12, (placement === 'bottom' ? viewportHeight - (rect?.bottom ?? viewportHeight - 12) : rect?.top ?? 12) - outset);
      const revealLeft = Math.max(0, (rect?.left ?? left) - left);
      dialog.style.width = `${panelWidth}px`;
      dialog.style.left = `${left}px`;
      dialog.style.setProperty('--production-dialog-reveal-left', `${revealLeft}px`);
      dialog.style.setProperty('--production-dialog-reveal-top', `${Math.max(0, (rect?.top ?? edge) - edge)}px`);
      dialog.style.setProperty('--production-dialog-reveal-right', `${Math.max(0, panelWidth - revealLeft - (rect?.width ?? panelWidth))}px`);
      dialog.style.setProperty('--production-dialog-reveal-height', `${rect?.height ?? 40}px`);
      dialog.style[placement] = `${edge}px`;
      dialog.style.maxHeight = `${Math.max(0, viewportHeight - edge - 12)}px`;
      if (preserveLogo && dialog.open) {
        const source = Array.from(anchor?.querySelectorAll<SVGElement>('.production-full-logo, .production-compact-logo') ?? [])
          .find((element) => element.getBoundingClientRect().width > 0)?.getBoundingClientRect();
        const logo = dialog.querySelector<SVGElement>('.production-ecosystem-logo');
        if (source && logo) {
          // Keep the existing grid slot, but pin the painted logo to the trigger.
          // Reset translation before measuring so resize never accumulates drift.
          logo.style.translate = '0px 0px'; logo.style.width = `${source.width}px`; logo.style.height = `${source.height}px`;
          const destination = logo.getBoundingClientRect();
          logo.style.translate = `${source.left - destination.left}px ${source.top - destination.top}px`;
        }
      }
    };
    position(); dialog.showModal(); position();
    const observer = new ResizeObserver(position);
    if (anchor) observer.observe(anchor);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); dialog.close(); anchor?.focus(); };
  }, [anchor, outset, placement, preserveLogo, width]);
  return <dialog ref={ref} className={`production-anchored-dialog ${className}`} aria-label={label}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}
