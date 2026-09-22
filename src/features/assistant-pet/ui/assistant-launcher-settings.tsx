'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Bot, Check, Sparkles } from '@prodactionpro/ui-core/icons';
import { useAssistantLauncherPreference } from '../model/use-assistant-launcher-preference';
import { ASSISTANT_CHARACTER_AVAILABLE } from '../model/assistant-pet-contract';

export function AssistantLauncherSettings() {
  const tUi = useTranslations();
  const { preference, updatePreference } = useAssistantLauncherPreference();
  if (!ASSISTANT_CHARACTER_AVAILABLE) return null;
  return (
    <div className="assistant-launcher-settings" role="group" aria-label={tUi("Вид кнопки ассистента")}>
      <strong>{tUi("Вход в ассистента")}</strong>
      <button type="button" onClick={() => updatePreference({ presentation: 'pet' })}>
        <Bot size={16} />
        <span><b>{tUi("Питомец")}</b><small>{tUi("Ровер с короткими репликами")}</small></span>
        {preference.presentation === 'pet' ? <Check size={15} /> : null}
      </button>
      <button type="button" onClick={() => updatePreference({ presentation: 'button' })}>
        <Sparkles size={16} />
        <span><b>{tUi("Кнопка")}</b><small>{tUi("Обычный вход без персонажа")}</small></span>
        {preference.presentation === 'button' ? <Check size={15} /> : null}
      </button>
    </div>
  );
}
