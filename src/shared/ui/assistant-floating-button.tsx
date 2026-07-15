'use client';

import { Sparkles } from 'lucide-react';

interface AssistantFloatingButtonProps {
  className?: string;
  onClick?: () => void;
}

export function AssistantFloatingButton({ className = '', onClick }: AssistantFloatingButtonProps) {
  return (
    <button
      type="button"
      className={`assistant-floating-button ${className}`}
      aria-label="Open assistant"
      onClick={onClick}
    >
      <Sparkles size={28} />
    </button>
  );
}
