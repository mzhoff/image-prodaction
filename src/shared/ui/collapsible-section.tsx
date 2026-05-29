'use client';

import { ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  sidePort?: ReactNode;
  dropTarget?: {
    nodeId: string;
    portId: string;
  };
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  sidePort,
  dropTarget,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const sectionOpen = open ?? internalOpen;
  const toggleOpen = () => {
    const nextOpen = !sectionOpen;
    onOpenChange?.(nextOpen);
    if (open === undefined) setInternalOpen(nextOpen);
  };

  return (
    <section className={cn('node-section', className)}>
      {sidePort}
      <button
        type="button"
        className={cn('node-section-title', dropTarget && 'node-section-title-drop-target')}
        data-port-node-id={dropTarget?.nodeId}
        data-port-id={dropTarget?.portId}
        data-port-side={dropTarget ? 'input' : undefined}
        data-connect-row={dropTarget ? 'true' : undefined}
        onClick={toggleOpen}
      >
        <strong>{title}</strong>
        <ChevronUp size={16} className={cn(!sectionOpen && 'section-chevron-closed')} />
      </button>
      {sectionOpen ? children : null}
    </section>
  );
}
