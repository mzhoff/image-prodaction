'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, LogOut } from '@prodactionpro/ui-core/icons';
import { useTheme } from '@prodactionpro/ui-core/theme';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { signOut } from '@/shared/auth/client';
import { ONBOARDING_STEPS, stepMissing, type OnboardingAnswers, type OnboardingField, type OnboardingState } from '@/shared/onboarding/contract';
import { useOnboardingDraft } from '../model/use-onboarding-draft';
import { steps, translate } from '../model/copy';
import { OnboardingChoices } from './onboarding-choices';
import './onboarding.css';
import { useJourney } from '@/shared/analytics/use-journey';

export function OnboardingPage({ initial, preview = false }: { initial: OnboardingState; preview?: boolean }) {
  const journey = useJourney('questionnaire', preview, initial.userId);
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const { draft, setDraft, persist, error } = useOnboardingDraft(initial, preview);
  const { setLocale } = useInterfaceLocale();
  const { setTheme } = useTheme();
  const router = useRouter();
  const [invalid, setInvalid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stepIndex = ONBOARDING_STEPS.indexOf(draft.step);
  useEffect(() => {
    const timer = setTimeout(() => { journeyRef.current.step(); journeyRef.current.event('ip_questionnaire_step_viewed', { step: stepIndex + 1 }); }, 0);
    return () => clearTimeout(timer);
  }, [stepIndex]);
  const info = steps[draft.step];
  const a = draft.answers;
  const t = (ru: string, en: string) => draft.locale === 'ru' ? ru : en;
  useEffect(() => { setTheme(draft.theme); }, [draft.theme, setTheme]);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [draft.step]);
  const remaining = ONBOARDING_STEPS.slice(stepIndex).reduce((count, step) => count + stepMissing(step, a).length, 0);
  function updateAnswers(answers: OnboardingAnswers) { setDraft((value) => ({ ...value, answers })); setInvalid([]); }
  const choices = (field: OnboardingField) => <OnboardingChoices field={field} answers={a} locale={draft.locale} onChange={updateAnswers} invalid={invalid.includes(field)} />;
  const input = (field: 'name' | 'industryOther' | 'goalOther' | 'taskOther' | 'toolOther', label: string, placeholder: string) => <label className="welcome-input-label">{label}
    <input className="welcome-input ym-disable-keys ym-hide-content" value={a[field]} placeholder={placeholder} maxLength={160} autoComplete={field === 'name' ? 'given-name' : 'off'}
      aria-invalid={invalid.includes(field)} aria-describedby={invalid.includes(field) ? `welcome-error-${field}` : undefined} onChange={(event) => updateAnswers({ ...a, [field]: event.target.value })} />
    {invalid.includes(field) ? <span id={`welcome-error-${field}`} className="welcome-validation">{t('Заполните это поле', 'Please fill in this field')}</span> : null}
  </label>;

  async function revisit(step: typeof draft.step) {
    if (busy || step === draft.step || stepMissing(step, a).length) return;
    journey.event('ip_questionnaire_back', { step: stepIndex + 1 });
    setBusy(true);
    try {
      const saved = await persist({ ...draft, step });
      setDraft((value) => ({ ...value, step, revision: saved.revision }));
      setInvalid([]);
    } catch { /* Keep the current form and show the save error. */ }
    finally { setBusy(false); }
  }

  async function navigate(direction: -1 | 1) {
    if (busy) return;
    if (direction === 1) { const missing = stepMissing(draft.step, a); setInvalid(missing); if (missing.length) { journey.event('ip_questionnaire_validation_failed', { step: stepIndex + 1 }); return; } }
    setBusy(true);
    const complete = direction === 1 && stepIndex === 4;
    const next = { ...draft, step: ONBOARDING_STEPS[Math.max(0, Math.min(4, stepIndex + direction))] };
    try {
      const saved = await persist(next, complete);
      journey.event(direction === 1 ? 'ip_questionnaire_step_completed' : 'ip_questionnaire_back', { step: stepIndex + 1 });
      if (complete) {
        journey.event('ip_questionnaire_completed', { step: 5 }); journey.finish();
        if (preview) setFinished(true);
        else { router.replace(saved.returnTo); router.refresh(); }
      } else { setDraft((value) => ({ ...value, step: next.step, revision: saved.revision })); setInvalid([]); }
    } catch { journey.event('ip_questionnaire_save_failed', { step: stepIndex + 1 }); }
    finally { setBusy(false); }
  }
  async function leave() {
    if (busy) return;
    setBusy(true); setLeaveError('');
    try {
      await persist();
      if (preview) { router.push('/'); return; }
      const result = await signOut();
      if (result.error) throw new Error('Не удалось выйти. Попробуйте ещё раз.');
      journey.event('ip_questionnaire_left', { step: stepIndex + 1 });
      journey.finish();
      router.replace('/login');
      router.refresh();
    } catch (caught) { setBusy(false); setLeaveError(caught instanceof Error ? caught.message : t('Не удалось выйти. Попробуйте ещё раз.', 'Could not sign out. Please try again.')); }
  }
  return <main className="welcome-page ym-show-content">
    <header className="welcome-top"><ReverieLogo />
      <div className="welcome-top-actions"><div className="welcome-segment" aria-label={t('Язык интерфейса', 'Language')}>
        {(['ru', 'en'] as const).map((locale) => <button key={locale} type="button" aria-pressed={draft.locale === locale} onClick={() => { setDraft((value) => ({ ...value, locale })); setLocale(locale); }}>{locale === 'ru' ? 'RU' : 'EN'}</button>)}
      </div><ProTooltip label={t(preview ? 'Закрыть просмотр' : 'Выйти', preview ? 'Close preview' : 'Sign out')}><button type="button" className="welcome-leave welcome-logout" onClick={() => void leave()} disabled={busy} aria-label={t(preview ? 'Закрыть просмотр' : 'Выйти', preview ? 'Close preview' : 'Sign out')}><LogOut size={17} aria-hidden="true" /></button></ProTooltip></div>
    </header>
    {leaveError ? <p className="welcome-error ym-hide-content" role="alert">{leaveError}</p> : null}
    <section className="welcome-card" aria-label={t('Знакомство с Reverie', 'Welcome to Reverie')}>
      <aside className="welcome-aside"><span className="welcome-eyebrow">REVERIE · PRODUCTION</span>
        <div className="welcome-art"><Image src={`/onboarding/${info.image}.webp`} alt="" width={768} height={512} sizes="(max-width: 760px) 120px, 360px" priority /></div>
        <h2>{t('Ваши идеи.\nВаше пространство.', 'Your ideas.\nYour space.')}</h2>
        <p>{t('Немного познакомимся — и можно создавать.', 'A quick introduction, then you’re ready to create.')}</p>
        <nav className="welcome-step-list" aria-label={t('Шаги знакомства', 'Introduction steps')}>{ONBOARDING_STEPS.map((step, i) => {
          const done = stepMissing(step, a).length === 0;
          return <button type="button" key={step} data-current={i === stepIndex} data-done={done} aria-current={i === stepIndex ? 'step' : undefined} disabled={busy || (!done && i !== stepIndex)} onClick={() => void revisit(step)}><span>{done ? <Check size={13} aria-label={t('Заполнено', 'Complete')} /> : i + 1}</span>{translate(steps[step].title, draft.locale)}</button>;
        })}</nav>
      </aside>
      <div className="welcome-main">
        {preview ? <div className="welcome-preview-note">{t('Тестовый просмотр · профиль и регистрация не меняются', 'Preview · your profile and registration stay unchanged')}</div> : null}
        {finished ? <div className="welcome-finished"><Check size={32} /><h1>{t('Можно начинать', 'You’re ready')}</h1><p>{t('Тестовый путь пройден. В обычном входе здесь откроется ваше пространство и знакомство с интерфейсом.', 'Preview complete. In the real flow, your workspace and its guided tour open here.')}</p><Link href="/" className="welcome-primary">{t('Открыть пространство', 'Open workspace')}</Link><button type="button" className="welcome-leave" onClick={() => { setFinished(false); setDraft({ ...initial }); }}>{t('Пройти ещё раз', 'Try again')}</button></div> : <>
          <div className="welcome-progress-label"><span>{t(`Шаг ${stepIndex + 1} из 5`, `Step ${stepIndex + 1} of 5`)}</span><span>{t(`Осталось вопросов: ${remaining}`, `Questions remaining: ${remaining}`)}</span></div>
          <div className="welcome-progress" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={stepIndex} aria-label={t('Прогресс анкеты', 'Questionnaire progress')}>{ONBOARDING_STEPS.map((step, i) => <span key={step} data-active={i <= stepIndex} />)}</div>
          <div className="welcome-heading"><h1 ref={titleRef} tabIndex={-1}>{translate(info.title, draft.locale)}{stepMissing(draft.step, a).length === 0 ? <Check className="welcome-complete" size={24} aria-label={t('Заполнено', 'Complete')} /> : null}</h1><p>{translate(info.description, draft.locale)}</p></div>
          <fieldset className="welcome-fields" disabled={busy} key={draft.step}>
            {draft.step === 'about' ? <>{input('name', t('Как к вам обращаться?', 'What should we call you?'), t('Ваше имя', 'Your name'))}{choices('age')}{choices('role')}
              <fieldset className="welcome-question"><legend>{t('Как вам комфортнее?', 'Make yourself comfortable')}</legend><div className="welcome-theme-options">{(['light', 'dark', 'system'] as const).map((theme, i) => <button type="button" key={theme} className="welcome-theme" aria-pressed={draft.theme === theme} onClick={() => setDraft((value) => ({ ...value, theme }))}><span data-preview-theme={theme}><i /><i /><i /></span>{t(['Светлая', 'Тёмная', 'Системная'][i], ['Light', 'Dark', 'System'][i])}</button>)}</div></fieldset></> : null}
            {draft.step === 'work' ? <>{choices('work')}{choices('team')}
              <p className="welcome-hint">{t('Команда, с которой вы создаёте контент.', 'The team you create content with.')}</p>
              {a.work && a.work !== 'personal' ? <>{choices('industry')}{a.industry === 'other' ? input('industryOther', t('Ваша сфера', 'Your field'), t('Расскажите, в какой сфере вы работаете', 'Describe your field of work')) : null}</> : null}</> : null}
            {draft.step === 'goals' ? <>{choices('goals')}{a.goals.includes('other') ? input('goalOther', t('Ваша цель — необязательно', 'Your goal — optional'), t('Пару слов о том, чего хочется достичь', 'A few words about your goal')) : null}</> : null}
            {draft.step === 'tasks' ? <>{choices('tasks')}{a.tasks.includes('other') ? input('taskOther', t('Ваша задача — необязательно', 'Your task — optional'), t('Что ещё вы хотели бы создавать?', 'What else would you like to create?')) : null}<p className="welcome-hint">{t('Можно отметить задачи за пределами Production — так мы узнаем, чего вам не хватает.', 'You can include tasks beyond Production to help us understand what’s missing.')}</p></> : null}
            {draft.step === 'experience' ? <>{choices('experience')}{choices('agents')}{choices('tools')}{a.tools.includes('other') ? input('toolOther', t('Какие ещё? — необязательно', 'Which ones? — optional'), t('Названия инструментов', 'Tool names')) : null}{choices('automation')}</> : null}
          </fieldset>
          <footer className="welcome-footer">
            {error ? <p role="alert" className="welcome-error ym-hide-content">{error} <button type="button" onClick={() => void persist().catch(() => undefined)}>{t('Повторить', 'Retry')}</button></p> : null}
            <div className="welcome-actions"><button type="button" className="welcome-back" disabled={stepIndex === 0 || busy} onClick={() => void navigate(-1)}><ArrowLeft size={16} />{t('Назад', 'Back')}</button><button className="welcome-primary" type="button" disabled={busy} onClick={() => void navigate(1)}>{busy ? <Loader2 className="welcome-spin" size={16} /> : null}{stepIndex === 4 ? t('Открыть пространство', 'Open workspace') : t('Продолжить', 'Continue')}<ArrowRight size={16} /></button></div>
          </footer>
        </>}
      </div>
    </section>
  </main>;
}
