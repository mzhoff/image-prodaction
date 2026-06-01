'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface PrimaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
}

export function PrimaryActionButton({
  children,
  className,
  icon,
  type = 'button',
  ...props
}: PrimaryActionButtonProps) {
  return (
    <button type={type} className={cn('primary-node-button', className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
