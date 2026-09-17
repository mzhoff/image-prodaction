'use client';

import { Bot, Check, Sparkles } from '@prodactionpro/ui-core/icons';
import { useAssistantLauncherPreference } from '../model/use-assistant-launcher-preference';

export function AssistantLauncherSettings() {
  const { preference, updatePreference } = useAssistantLauncherPreference();
  return (
    <div className="assistant-launcher-settings" role="group" aria-label="Вид кнопки ассистента">
      <strong>Вход в ассистента</strong>
      <button type="button" onClick={() => updatePreference({ presentation: 'pet' })}>
        <Bot size={16} />
        <span><b>Питомец</b><small>Ровер с короткими репликами</small></span>
        {preference.presentation === 'pet' ? <Check size={15} /> : null}
      </button>
      <button type="button" onClick={() => updatePreference({ presentation: 'button' })}>
        <Sparkles size={16} />
        <span><b>Кнопка</b><small>Обычный вход без персонажа</small></span>
        {preference.presentation === 'button' ? <Check size={15} /> : null}
      </button>
    </div>
  );
}
