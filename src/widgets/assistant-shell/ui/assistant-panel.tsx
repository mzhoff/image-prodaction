'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useCallback, useState, type ReactNode } from 'react';
import { Bot, Check, MessageSquareText } from '@prodactionpro/ui-core/icons';
import { AssistantWindow, type AssistantWindowProps } from '@/shared/assistant/ui/assistant-window';
import { AssistantLauncherSettings } from '@/features/assistant-pet/ui/assistant-launcher-settings';
import { FeedbackPanel } from './feedback-panel';

/** Production slots; geometry, controls, appearance and hooks live in Shared. */
export function AssistantPanel({ children, ...props }: Omit<AssistantWindowProps, 'children' | 'settings' | 'dropEnabled'> & {
  children: ReactNode | ((showAssistant: () => void) => ReactNode);
}) {
  const tUi = useTranslations();
  const [view, setView] = useState<'assistant' | 'feedback'>('assistant');
  const showAssistant = useCallback(() => setView('assistant'), []);
  return <AssistantWindow {...props} title={view === 'assistant' ? props.title : 'Feedback'}
    icon={view === 'assistant' ? props.icon : <MessageSquareText size={18} />}
    onClose={() => { showAssistant(); props.onClose(); }} dropEnabled={view === 'assistant'}
    settings={(close) => <>
      <button type="button" onClick={() => { showAssistant(); close(); }}><Bot size={16} /><span><b>{tUi("Ассистент")}</b><small>{tUi("Вернуться к диалогу")}</small></span>{view === 'assistant' ? <Check size={15} /> : null}</button>
      <button type="button" onClick={() => { setView('feedback'); close(); }}><MessageSquareText size={16} /><span><b>{tUi("Обратная связь")}</b><small>{tUi("Оценить продукт или сообщить о проблеме")}</small></span>{view === 'feedback' ? <Check size={15} /> : null}</button>
      <AssistantLauncherSettings />
    </>}>
    <div aria-label="Assistant" className="assistant-shell-assistant-panel" hidden={view !== 'assistant'}>
      {typeof children === 'function' ? children(showAssistant) : children}
    </div>
    <div aria-label="Feedback" className="assistant-shell-feedback-panel" hidden={view !== 'feedback'}>
      <FeedbackPanel contextLabel={props.contextLabel} />
    </div>
  </AssistantWindow>;
}
