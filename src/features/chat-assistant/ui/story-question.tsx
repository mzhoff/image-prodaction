'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';

import { useEffect, useRef, useState } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import type { ChatToolRendererContext } from '@prodactionpro/chat-ui';
import { HelpCircle, Check, X, ArrowUp } from '@prodactionpro/ui-core/icons';
import { isStoryQuestionAnswered, readStoryQuestion } from '../model/story-interactions';
import { useStoryAuthoring } from './story-authoring-provider';

export function StoryQuestionCard({ safeResult, toolCall }: ChatToolRendererContext) {
  const tUi = useTranslations();
  const question = readStoryQuestion(safeResult), authoring = useStoryAuthoring();
  const { messages } = useChatRuntimeState();
  if (!question) return null;
  const answered = isStoryQuestionAnswered(messages, question.interactionId);
  return <section className="story-question-card"><p>{question.question}</p>
    <button type="button" className="story-question-trigger" disabled={answered || authoring.busy}
      onClick={() => authoring.open({ question, messageId: toolCall.id })}>
      {answered ? <Check size={16} /> : <HelpCircle size={16} />}<span>{answered ? tUi("Ответ отправлен") : tUi("Ответить на вопрос")}</span>
    </button></section>;
}

export function StoryQuestionPanel() {
  const authoring = useStoryAuthoring();
  if (!authoring.active) return null;
  return <QuestionForm key={authoring.active.question.interactionId} />;
}
function QuestionForm() {
  const tUi = useTranslations();
  const accessGate = useAiAccessGate();
  const { active, close, busy } = useStoryAuthoring();
  const runtime = useChatRuntime();
  const [selected, setSelected] = useState<number | 'custom'>(), [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const panel = useRef<HTMLFormElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  if (!active) return null;
  const { question, messageId } = active;
  const answer = selected === 'custom' ? custom.trim() : selected !== undefined ? question.options[selected].label : '';
  const submit = async () => {
    if (!answer || busy || sending) return;
    let draft = '';
    setSending(true); setError('');
    try {
      if (!await accessGate.ensure() || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
      draft = runtime.getSnapshot().inputValue;
      await runtime.submit(answer, { selectedAction: {
        id: `story-answer:${question.interactionId}`, type: 'submit', label: 'Ответить на вопрос', message: answer,
        source: { blockType: 'tool-result', messageId },
        payload: { kind: 'story-answer', interactionId: question.interactionId, answer, question: question.question, choice: selected },
      } });
      close();
    } catch (error) { if (!accessGate.onError(error)) setError(tUi("Не удалось отправить ответ. Попробуйте ещё раз.")); }
    finally { if (draft && !runtime.getSnapshot().inputValue) runtime.setInputValue(draft); setSending(false); }
  };
  return <form ref={panel} className="story-question-panel" aria-label={tUi("Ответ на вопрос соавтора")}
    onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <header><span><HelpCircle size={17} />{tUi("Уточним замысел")}</span><button type="button" aria-label={tUi("Закрыть вопрос")} onClick={close}><X size={16} /></button></header>
    <h3 id={`question-${question.interactionId}`}>{question.question}</h3>
    <div role="radiogroup" aria-labelledby={`question-${question.interactionId}`} className="story-question-options" onKeyDown={(event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const current = selected === 'custom' ? 2 : selected ?? 0;
      const next = (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : 2)) % 3;
      setSelected(next === 2 ? 'custom' : next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    }}>
      {question.options.map((option, index) => <button type="button" role="radio" aria-checked={selected === index} disabled={busy || sending} key={index}
        onClick={() => setSelected(index)}><span className="story-question-radio">{selected === index ? <Check size={12} /> : index + 1}</span><span><strong>{option.label}</strong><small>{option.description}</small></span></button>)}
      <button type="button" role="radio" aria-checked={selected === 'custom'} disabled={busy || sending} onClick={() => setSelected('custom')}><span className="story-question-radio">{selected === 'custom' ? <Check size={12} /> : '3'}</span><span><strong>{tUi("Свой вариант")}</strong><small>{tUi("Расскажите, как видите это вы")}</small></span></button>
    </div>
    {selected === 'custom' ? <textarea autoFocus aria-label={tUi("Свой ответ")} placeholder={tUi("Я вижу это так…")} value={custom} maxLength={2000} rows={2} disabled={busy || sending} onChange={(event) => setCustom(event.target.value)} /> : null}
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    <footer><button type="submit" disabled={!answer || busy || sending}><ArrowUp size={15} />{sending ? tUi("Отправляю…") : tUi("Ответить")}</button></footer>
  </form>;
}
