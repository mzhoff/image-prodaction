'use client';

import { Download, FileInput, ImageIcon, Paintbrush, PencilLine, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function NodeTitle({ title, muted, action }: { title: string; muted?: boolean; action?: ReactNode }) {
  const Icon = getNodeIcon(title);
  return (
    <h2 className={cn('node-title', muted && 'node-title-muted')}>
      <span className="node-title-main">
        {Icon ? <Icon size={16} /> : null}
        <span>{title}</span>
      </span>
      {action}
    </h2>
  );
}

function getNodeIcon(title: string) {
  if (title === 'Import') return FileInput;
  if (title === 'Extract') return WandSparkles;
  if (title === 'Generate Image') return ImageIcon;
  if (title === 'Sketch') return Paintbrush;
  if (title === 'Export') return Download;
  if (title === 'Prompt') return PencilLine;
  return null;
}
