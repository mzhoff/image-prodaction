'use client';
import { useState, type FormEvent } from 'react';
import { BrandSelect } from '@/shared/ui/brand-select';
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
  const [period, setPeriod] = useState(member.period);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const limit = String(fields.get('limit') ?? '').trim();
    void save({ enabled: fields.get('enabled') === 'on', limitUsd: limit || null, period });
  }
  return (
    <form className="settings-form" onSubmit={submit} aria-label={`Лимит участника ${member.name}`}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 14 }}>
        <legend>{member.name}: настройки AI</legend>
        <label className="settings-checkbox">
          <input type="checkbox" name="enabled" defaultChecked={member.enabled} />
          <span>Разрешить платные AI-запросы</span>
        </label>
        <label>
          <span>Лимит в USD</span>{' '}
          <input
            name="limit"
            inputMode="decimal"
            defaultValue={member.limitUsd ?? ''}
            pattern="[0-9]{1,12}(\.[0-9]{1,8})?"
            maxLength={21}
            placeholder="Без лимита"
          />
        </label>
        <BrandSelect
          label="Период лимита"
          value={period}
          disabled={busy}
          onChange={(value) => setPeriod(value === 'month' ? 'month' : 'lifetime')}
          options={[
            { value: 'lifetime', label: 'За всё время, без сброса' },
            { value: 'month', label: 'Календарный месяц (UTC)' },
          ]}
        />
        <p>
          Сумма включает уже понесённые расходы за выбранный период. Пустое поле — без личного лимита. Токены
          показываем в статистике, а бюджет задаём в USD: у разных моделей разная цена токена.
        </p>
        <div className="settings-form-actions">
          <button className="settings-primary-button" type="submit">
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>{' '}
          <button className="settings-quiet-button" type="button" onClick={cancel}>
            Отмена
          </button>
        </div>
      </fieldset>
    </form>
  );
}
