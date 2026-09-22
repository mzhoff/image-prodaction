'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Sparkles } from '@prodactionpro/ui-core/icons';
import { IconButton } from '@prodactionpro/ui-core/icon-button';

interface AssistantFloatingButtonProps {
  className?: string;
  onClick?: () => void;
}

export function AssistantFloatingButton({ className = '', onClick }: AssistantFloatingButtonProps) {
  const tUi = useTranslations();
  return (
    <IconButton
      type="button"
      intent="neutral"
      appearance="solid"
      size="xl"
      icon={<Sparkles size={28} />}
      className={`assistant-floating-button ${className}`}
      data-snapshot-exclude
      aria-label={tUi("Открыть ассистента")}
      inert={className.includes('assistant-floating-button-hidden')}
      onClick={onClick}
    />
  );
}
