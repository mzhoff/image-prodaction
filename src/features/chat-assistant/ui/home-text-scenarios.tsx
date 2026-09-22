'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useChatRuntime } from '@prodactionpro/chat-runtime-react';
import { FileText, Image as ImageIcon, MessageSquare } from '@prodactionpro/ui-core/icons';

export const HOME_TEXT_SCENARIOS = [
  { id: 'idea', label: 'Обсудить идею', Icon: MessageSquare, prompt: 'Помоги обсудить и развить идею. Сначала задай вопросы о цели и аудитории, затем предложи несколько направлений. Моя идея: ' },
  { id: 'article', label: 'Написать статью', Icon: FileText, prompt: 'Помоги написать статью. Сначала уточни тему, аудиторию и желаемый стиль, затем предложи структуру. Тема: ' },
  { id: 'images', label: 'Проанализировать изображения', Icon: ImageIcon, prompt: 'Проанализируй прикреплённые изображения: композицию, цвет, свет и детали. Отделяй наблюдения от предположений и предложи улучшения. Если изображений нет, попроси их прикрепить.' },
] as const;

export function HomeTextScenarios({ onSelect }: { onSelect: () => void }) {
  const tUi = useTranslations();
  const ui_HOME_TEXT_SCENARIOS = useUiCatalog(HOME_TEXT_SCENARIOS, tUi);
  const runtime = useChatRuntime();
  return <div className="production-home-text-scenarios" role="group" aria-label={tUi("Текстовые задачи")}>
    {ui_HOME_TEXT_SCENARIOS.map(({ id, label, Icon, prompt }) => <button key={id} className="production-home-text-entry" type="button" onClick={() => {
      onSelect(); runtime.setMode('general-chat'); runtime.setInputValue(prompt);
      // Preparing a scenario does not submit a paid request; the user can edit it first.
      document.querySelector<HTMLTextAreaElement>('.home-image-form textarea')?.focus();
    }}><Icon size={16} />{label}</button>)}
  </div>;
}
