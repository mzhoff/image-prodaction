'use client';

import { FileInput, ImageIcon, PencilLine, WandSparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export function NodeTitle({ title, muted }: { title: string; muted?: boolean }) {
  const Icon = getNodeIcon(title);
  return (
    <h2 className={cn('node-title', muted && 'node-title-muted')}>
      {Icon ? <Icon size={16} /> : null}
      <span>{title}</span>
    </h2>
  );
}

function getNodeIcon(title: string) {
  if (title === 'Import') return FileInput;
  if (title === 'Extract') return WandSparkles;
  if (title === 'Generate Image') return ImageIcon;
  if (title === 'Prompt') return PencilLine;
  return null;
}
