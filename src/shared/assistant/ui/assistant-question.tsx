'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { SemanticBlockRenderer } from '@prodactionpro/chat-ui';
import type { ChatActionSelection } from '@prodactionpro/chat-domain';
import { questionReplies, type AssistantQuestion as Question } from '../model/assistant-question';

export function AssistantQuestion({ question, sourceMessageId, answer, closed, busy, error, onAnswer }: {
  question: Question; sourceMessageId: string; answer?: string; closed: boolean; busy: boolean; error?: string;
  onAnswer: (selection: ChatActionSelection) => void;
}) {
  const tUi = useTranslations();
  if (closed) return answer ? <p className="assistant-question-answer" role="status">{tUi("Выбрано:")}{' '} {answer}</p> : null;
  return <div className="assistant-question" aria-busy={busy}>
    <SemanticBlockRenderer block={questionReplies(question)} messageId={sourceMessageId} onAction={busy ? undefined : onAnswer} />
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
  </div>;
}
