'use client';

import type { CSSProperties, RefObject, WheelEvent as ReactWheelEvent } from 'react';
import { cn } from '@/shared/lib/cn';

interface PromptBoxProps {
  className?: string;
  style?: CSSProperties;
  value?: string;
  placeholder?: string;
  readonly?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onChange?: (value: string) => void;
}

const DEFAULT_PROMPT_PLACEHOLDER = 'Добавьте промпт или ограничение';

export function PromptBox({
  className,
  style,
  value,
  placeholder = DEFAULT_PROMPT_PLACEHOLDER,
  readonly,
  textareaRef,
  onChange,
}: PromptBoxProps) {
  const textareaPlaceholder = readonly && placeholder === DEFAULT_PROMPT_PLACEHOLDER ? '' : placeholder;

  return (
    <textarea
      ref={textareaRef}
      className={cn('prompt-box', readonly && 'prompt-box-readonly', className)}
      value={value ?? ''}
      readOnly={readonly}
      style={style}
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
