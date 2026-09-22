'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { CSSProperties, RefObject } from 'react';
import { TextareaControl } from '@prodactionpro/ui-core/textarea-control';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from './use-scrollable-wheel';

interface PromptBoxProps {
  textField?: string;
  ariaLabel?: string;
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
  textField,
  ariaLabel,
  className,
  style,
  value,
  placeholder,
  readonly,
  textareaRef,
  onChange,
}: PromptBoxProps) {
  const tUi = useTranslations();
  const textareaPlaceholder = readonly && (!placeholder || placeholder === DEFAULT_PROMPT_PLACEHOLDER) ? '' : placeholder ?? tUi(DEFAULT_PROMPT_PLACEHOLDER);
  const handleWheel = useScrollableWheel<HTMLTextAreaElement>();

  return (
    <TextareaControl
      data-text-field={textField}
      aria-label={ariaLabel}
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
