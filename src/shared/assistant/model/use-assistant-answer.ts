'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useRef, useState } from 'react';
import { useChatRuntime } from '@prodactionpro/chat-runtime-react';
import type { ChatActionSelection } from '@prodactionpro/chat-domain';
import { readAssistantAnswer } from './assistant-question';

/** Uses the published ChatModule transport; authorization remains with the host. */
export function useAssistantAnswer(gate: { ensure: () => Promise<boolean>; onError: (error: unknown) => boolean }) {
  const tUi = useTranslations();
  const runtime = useChatRuntime();
  const locked = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (selection: ChatActionSelection) => {
    const answer = readAssistantAnswer(selection);
    if (!answer || locked.current || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
    locked.current = true; setSending(true); setError('');
    const conversationId = runtime.getSnapshot().conversationId;
    try {
      if (!await gate.ensure() || runtime.getSnapshot().conversationId !== conversationId
        || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
      const draft = runtime.getSnapshot().inputValue;
      const attachments = runtime.getSnapshot().attachments;
      await runtime.submit(answer.answer, { selectedAction: selection, attachments: [], onOptimisticCommit: () => {
        // This answer is independent of anything the user is drafting in the composer.
        runtime.setInputValue(draft);
        runtime.setAttachments(attachments);
      } });
    } catch (cause) {
      if (!gate.onError(cause)) setError(tUi("Не удалось отправить ответ. Попробуйте повторить отправку."));
    } finally { locked.current = false; setSending(false); }
  };
  return { submit, sending, error };
}
