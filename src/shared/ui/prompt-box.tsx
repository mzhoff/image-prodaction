'use client';

import type { WheelEvent as ReactWheelEvent } from 'react';
import { cn } from '@/shared/lib/cn';

interface PromptBoxProps {
  className?: string;
  value?: string;
  placeholder?: string;
  readonly?: boolean;
  onChange?: (value: string) => void;
}

const DEFAULT_PROMPT_PLACEHOLDER = 'Добавьте промпт или ограничение';

export function PromptBox({ className, value, placeholder = DEFAULT_PROMPT_PLACEHOLDER, readonly, onChange }: PromptBoxProps) {
  const textareaPlaceholder = readonly && placeholder === DEFAULT_PROMPT_PLACEHOLDER ? '' : placeholder;

  return (
    <textarea
      className={cn('prompt-box', readonly && 'prompt-box-readonly', className)}
      value={value ?? ''}
      readOnly={readonly}
      onChange={(event) => {
        if (!readonly) onChange?.(event.target.value);
      }}
      onWheel={handleTextareaWheel}
      placeholder={textareaPlaceholder}
      data-node-interactive
    />
  );
}

function handleTextareaWheel(event: ReactWheelEvent<HTMLTextAreaElement>) {
  const textarea = event.currentTarget;
  if (textarea.scrollHeight > textarea.clientHeight || textarea.scrollWidth > textarea.clientWidth) {
    event.stopPropagation();
  }
}
