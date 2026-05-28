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
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  sidePort,
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
      <button type="button" className="node-section-title" onClick={toggleOpen}>
        <strong>{title}</strong>
        <ChevronUp size={16} className={cn(!sectionOpen && 'section-chevron-closed')} />
      </button>
      {sectionOpen ? children : null}
    </section>
  );
}
