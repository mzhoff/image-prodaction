'use client';
import { Check } from '@prodactionpro/ui-core/icons';
import { answerOptions, type OnboardingAnswers, type OnboardingField, type OnboardingLocale } from '@/shared/onboarding/contract';
import { labels, options, translate } from '../model/copy';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

export function OnboardingChoices({ field, answers, locale, onChange, invalid = false }: {
  field: OnboardingField; answers: OnboardingAnswers; locale: OnboardingLocale;
  onChange: (next: OnboardingAnswers) => void; invalid?: boolean;
}) {
  const value = answers[field];
  const multiple = Array.isArray(value);
  function choose(id: string) {
    let next: string | string[] = id;
    if (multiple) {
      const values: readonly string[] = value;
      next = values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
      if (field === 'tools') next = id === 'none' ? ['none'] : next.filter((item) => item !== 'none');
    }
    onChange({ ...answers, [field]: next });
  }
  return <fieldset className="welcome-question" data-invalid={invalid || undefined}>
    <legend>{translate(labels[field], locale)}{field === 'agents' ? <ProTooltip wrap label={locale === 'ru' ? 'Агент может выполнить несколько шагов задачи и использовать инструменты.' : 'An agent can work through multiple steps and use tools.'}><button type="button" className="welcome-question-help" aria-label={locale === 'ru' ? 'Что такое AI-агент? Агент может выполнить несколько шагов задачи и использовать инструменты.' : 'What is an AI agent? An agent can work through multiple steps and use tools.'}>?</button></ProTooltip> : null}{multiple ? <small>{locale === 'ru' ? 'Можно несколько' : 'Select any'}</small> : null}</legend>
    <div className={`welcome-choices welcome-choices-${field}`}>
      {answerOptions[field].map((id) => {
        const selected = multiple ? (value as string[]).includes(id) : value === id;
        return <button key={id} type="button" className="welcome-choice" aria-pressed={selected} onClick={() => choose(id)}>
          <span>{translate(options[field][id], locale)}</span><span className="welcome-choice-mark" aria-hidden="true">{selected ? <Check size={13} /> : null}</span>
        </button>;
      })}
    </div>
    {invalid ? <span className="welcome-validation">{locale === 'ru' ? 'Выберите ответ' : 'Choose an answer'}</span> : null}
  </fieldset>;
}
