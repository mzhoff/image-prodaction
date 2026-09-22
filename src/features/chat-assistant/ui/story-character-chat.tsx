'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';

import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from 'react';
import { useChatRuntime } from '@prodactionpro/chat-runtime-react';
import { ArrowUp, BookOpen, Check, Sparkles, UserRound, X } from '@prodactionpro/ui-core/icons';
import { useStoryAuthoring } from './story-authoring-provider';
import { HomeMaterialTrigger } from './home-material-trigger';

export interface StoryCharacterChatContext {
  hasBlueprint: boolean; total: number; ready: number; skipped: boolean;
  focused?: { id: string; name: string };
  open: () => void; library: () => void; clearFocus: () => void;
}
const Context = createContext<(StoryCharacterChatContext & { start: boolean; setStart: (value: boolean) => void }) | undefined>(undefined);
export function StoryCharacterChatProvider({ value, children }: { value?: StoryCharacterChatContext; children: ReactNode }) {
  const [start, setStart] = useState(false);
  const authoring = useStoryAuthoring();
  useEffect(() => { if (authoring.active) setStart(false); }, [authoring.active]);
  const showStart = (next: boolean) => { if (next) authoring.close(); setStart(next); };
  return <Context.Provider value={value ? { ...value, start, setStart: showStart } : undefined}>{children}</Context.Provider>;
}
export function StoryCharactersInvitation({ compact = false }: { compact?: boolean }) {
  const tUi = useTranslations();
  const context = useContext(Context), authoring = useStoryAuthoring();
  if (!context?.hasBlueprint || context.skipped) return null;
  const done = context.total > 0 && context.ready === context.total;
  return <div className={`story-characters-invitation ${compact ? 'is-compact' : ''}`}>
    {!compact ? <p>{done ? tUi("Образы выбраны. Герои готовы к раскадровке.") : context.total ? tUi("Давайте выберем образы героев, чтобы они оставались узнаваемыми в кадрах.") : tUi("История сложилась. Давайте подготовим героев и найдём их образы.")}</p> : null}
    <button type="button" className="story-question-trigger" disabled={authoring.busy} onClick={() => context.total ? context.open() : context.setStart(true)}>
      {done ? <Check size={16} /> : <UserRound size={16} />}<span>{context.total ? tUi("Герои · {p1} из {p2}", { p1: context.ready, p2: context.total }) : tUi("Подготовить героев")}</span>
    </button>
  </div>;
}
export function StoryCharacterFocus() {
  const tUi = useTranslations();
  const context = useContext(Context), authoring = useStoryAuthoring();
  return context?.focused ? <div className="story-character-focus"><UserRound size={14} /><button type="button" onClick={context.open}>{tUi("Работаем с")}{' '} {context.focused.name}</button><button type="button" aria-label={tUi("Вернуться к обсуждению истории")} disabled={authoring.busy} onClick={context.clearFocus}><X size={13} /></button></div> : null;
}
export function StoryCharactersButton() {
  const tUi = useTranslations();
  const context = useContext(Context), authoring = useStoryAuthoring();
  return context ? <HomeMaterialTrigger label={tUi("Герои")} icon={<UserRound />} count={context.total} limit={12} disabled={authoring.busy}
    ariaLabel={tUi("Герои истории, подготовлено {p1} из {p2}", { p1: context.ready, p2: context.total })} expanded={context.start}
    onClick={() => context.total || !context.hasBlueprint ? context.open() : context.setStart(true)} /> : null;
}
export function StoryCharacterStartPanel() {
  const context = useContext(Context);
  return context?.start ? <StartForm /> : null;
}
function StartForm() {
  const tUi = useTranslations();
  const accessGate = useAiAccessGate();
  const context = useContext(Context)!, runtime = useChatRuntime(), authoring = useStoryAuthoring();
  const [choice, setChoice] = useState<'story' | 'library' | 'custom'>('story');
  const [custom, setCustom] = useState(''), [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; form.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus(); return () => previous?.focus(); }, []);
  const submit = async () => {
    if (authoring.busy || sending) return;
    if (choice === 'library') { context.setStart(false); context.library(); return; }
    let draft = '';
    setSending(true);
    try {
      if (!await accessGate.ensure() || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
      draft = runtime.getSnapshot().inputValue;
      await runtime.submit(choice === 'custom' ? `Подготовь героев истории. Мои пожелания: ${custom}` : 'Подготовь паспорта главных героев по сохранённому лору истории. Выбери подходящие атрибуты и сохрани через story_save_characters.');
      context.setStart(false); context.open();
    } catch (error) { context.setStart(true); if (!accessGate.onError(error)) setError(tUi("Не удалось отправить запрос. Попробуйте снова.")); }
    finally { if (draft && !runtime.getSnapshot().inputValue) runtime.setInputValue(draft); setSending(false); }
  };
  return <form ref={form} className="story-question-panel" aria-label={tUi("Подготовить героев")} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === 'Escape') context.setStart(false); }}>
    <header><span><UserRound size={17} />{tUi("Герои истории")}</span><button type="button" aria-label={tUi("Закрыть подготовку героев")} onClick={() => context.setStart(false)}><X size={16} /></button></header>
    <h3>{tUi("С чего начнём образы героев?")}</h3>
    <div className="story-question-options" role="radiogroup" aria-label={tUi("Источник героев")} onKeyDown={(event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const options = ['story', 'library', 'custom'] as const;
      const index = (options.indexOf(choice) + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : 2)) % 3;
      setChoice(options[index]); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    }}>
      <button type="button" disabled={sending} role="radio" tabIndex={choice === 'story' ? 0 : -1} aria-checked={choice === 'story'} onClick={() => setChoice('story')}><Sparkles size={20} /><span><strong>{tUi("Создать по истории")}</strong><small>{tUi("Соавтор предложит характер и внешность из вашего лора")}</small></span></button>
      <button type="button" disabled={sending} role="radio" tabIndex={choice === 'library' ? 0 : -1} aria-checked={choice === 'library'} onClick={() => setChoice('library')}><BookOpen size={20} /><span><strong>{tUi("Выбрать из Library")}</strong><small>{tUi("Возьмём знакомого героя и адаптируем к этой истории")}</small></span></button>
      <button type="button" disabled={sending} role="radio" tabIndex={choice === 'custom' ? 0 : -1} aria-checked={choice === 'custom'} onClick={() => setChoice('custom')}><UserRound size={20} /><span><strong>{tUi("Свой вариант")}</strong><small>{tUi("У меня уже есть идея персонажа")}</small></span></button>
    </div>
    {choice === 'custom' ? <textarea disabled={sending} autoFocus aria-label={tUi("Пожелания к героям")} rows={2} maxLength={2000} placeholder={tUi("Например, застенчивый Колобок и озорная Лиса…")} value={custom} onChange={(event) => setCustom(event.target.value)} /> : null}
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    <footer><button type="submit" disabled={sending || authoring.busy || (choice === 'custom' && !custom.trim())}><ArrowUp size={15} />{choice === 'library' ? tUi("Открыть Library") : tUi("Подготовить")}</button></footer>
  </form>;
}
