'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from '@prodactionpro/ui-core/button';
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
    <Button type={type} intent="neutral" size="md" leadingIcon={icon} className={cn('primary-node-button', className)} {...props}>
      {children}
    </Button>
  );
}
