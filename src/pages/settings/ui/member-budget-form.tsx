'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';
import { useState, type FormEvent } from 'react';
import { SettingsSelect } from './settings-select';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import type {
  MemberBudgetPolicy,
  MemberBudgetRow,
} from '@/modules/workspace-budgets/contracts/member-budget';

export function MemberBudgetForm({
  member,
  busy,
  cancel,
  save,
}: {
  member: MemberBudgetRow;
  busy: boolean;
  cancel: () => void;
  save: (policy: Omit<MemberBudgetPolicy, 'mode' | 'revision'>) => Promise<void>;
}) {
  const tUi = useTranslations();
  const [period, setPeriod] = useState(member.period);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const limit = String(fields.get('limit') ?? '').trim();
    void save({ enabled: fields.get('enabled') === 'on', limitUsd: limit || null, period });
  }
  return (
    <form className="settings-form" onSubmit={submit} aria-label={tUi("Лимит участника {p1}", { p1: member.name })}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 14 }}>
        <legend>{member.name}{tUi(": настройки AI")}</legend>
        <label className="settings-checkbox">
          <input type="checkbox" name="enabled" defaultChecked={member.enabled} />
          <span>{tUi("Разрешить платные AI-запросы")}</span>
        </label>
        <label>
          <span>{tUi("Лимит в USD")}</span>{' '}
          <PuiInput
            name="limit"
            inputMode="decimal"
            defaultValue={member.limitUsd ?? ''}
            pattern="[0-9]{1,12}(\.[0-9]{1,8})?"
            maxLength={21}
            placeholder={tUi("Без лимита")}
          />
        </label>
        <SettingsSelect
          label={tUi("Период лимита")}
          value={period}
          disabled={busy}
          onChange={(value) => setPeriod(value === 'month' ? 'month' : 'lifetime')}
          options={[
            { value: 'lifetime', label: tUi("За всё время, без сброса") },
            { value: 'month', label: tUi("Календарный месяц (UTC)") },
          ]}
        />
        <p>
          {tUi("Лимит в USD учитывает уже потраченное за выбранный период. Пустое поле — без ограничения.")}</p>
        <div className="settings-form-actions">
          <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit">
            {busy ? tUi("Сохраняем…") : tUi("Сохранить")}
          </Button>{' '}
          <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" onClick={cancel}>
            {tUi("Отмена")}</Button>
        </div>
      </fieldset>
    </form>
  );
}
