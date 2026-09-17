'use client';

import { Sparkles } from '@prodactionpro/ui-core/icons';
import { IconButton } from '@prodactionpro/ui-core/icon-button';

interface AssistantFloatingButtonProps {
  className?: string;
  onClick?: () => void;
}

export function AssistantFloatingButton({ className = '', onClick }: AssistantFloatingButtonProps) {
  return (
    <IconButton
      type="button"
      intent="neutral"
      appearance="solid"
      size="xl"
      icon={<Sparkles size={28} />}
      className={`assistant-floating-button ${className}`}
      data-snapshot-exclude
      aria-label="Open assistant"
      onClick={onClick}
    />
  );
}
