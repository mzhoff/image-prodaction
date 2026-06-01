'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface ProTooltipProps {
  children: ReactNode;
  label: string;
  offset?: number;
  shortcut?: string;
  side?: 'top' | 'bottom';
}

interface TooltipPosition {
  left: number;
  top: number;
}

export function ProTooltip({ children, label, offset = 8, shortcut, side = 'top' }: ProTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const top = side === 'top'
      ? triggerRect.top - tooltipRect.height - offset
      : triggerRect.bottom + offset;
    const left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, top)),
    });
  }, [label, offset, open, shortcut, side]);

  useEffect(() => {
    if (!open) return undefined;

    const closeTooltip = () => setOpen(false);
    window.addEventListener('resize', closeTooltip);
    window.addEventListener('scroll', closeTooltip, true);
    return () => {
      window.removeEventListener('resize', closeTooltip);
      window.removeEventListener('scroll', closeTooltip, true);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className="pro-tooltip-trigger"
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open ? createPortal(
        <div
          ref={tooltipRef}
          className="pro-tooltip"
          style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
        >
          <span>{label}</span>
          {shortcut ? <kbd>{shortcut}</kbd> : null}
        </div>,
        document.body,
      ) : null}
    </span>
  );
}
