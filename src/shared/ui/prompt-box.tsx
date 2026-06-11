'use client';

import type { CSSProperties, RefObject } from 'react';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from './use-scrollable-wheel';

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
  const handleWheel = useScrollableWheel<HTMLTextAreaElement>();

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
      onWheelCapture={handleWheel}
      placeholder={textareaPlaceholder}
      data-node-interactive
    />
  );
}
