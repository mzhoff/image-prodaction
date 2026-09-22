'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef, useState } from 'react';
import { ChevronDown } from '@prodactionpro/ui-core/icons';
import type { UsagePeriod, UsagePreset } from '@/modules/usage/contracts/usage-dashboard';
import { usagePeriod } from '@/modules/usage/core/usage-dashboard';
import { usagePresetPeriod } from '@/modules/usage/core/usage-periods';
import { DateRangeCalendar } from '@/shared/ui/date-range-calendar';
import { useUsageFormat } from './use-usage-format';

const PRESETS = [{ id: 'today', label: 'Сегодня' }, { id: 'yesterday', label: 'Вчера' }, { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' }, { id: 'quarter', label: 'Квартал' }] as const;

export function UsagePeriodToolbar({ period, preset, onChange }: {
  period: UsagePeriod; preset: UsagePreset; onChange: (period: UsagePeriod, preset: UsagePreset) => void;
}) {
  const { usageRangeLabel } = useUsageFormat();
  const tUi = useTranslations();
  const ui_PRESETS = useUiCatalog(PRESETS, tUi);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="usage-period-toolbar" aria-label={tUi("Период аналитики")}>
    <div className="usage-period-group" role="group" aria-label={tUi("Период")}>
      {ui_PRESETS.map((p) => <button key={p.id} className="usage-period-button" type="button" aria-pressed={preset === p.id}
        onClick={() => onChange(usagePresetPeriod(p.id, period.timezone), p.id)}>{p.label}</button>)}
      <button type="button" className="usage-range-trigger usage-period-button" ref={trigger} aria-label={tUi("Свой период")} aria-pressed={preset === 'custom'} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}>{usageRangeLabel(period.from, period.to)}<ChevronDown size={13} /></button>
    </div>
    {open ? <DateRangeCalendar value={period} maxDate={usagePresetPeriod('today', period.timezone).to} anchorRef={trigger} onClose={() => setOpen(false)}
      onApply={(draft) => { onChange(usagePeriod(draft.from, draft.to, period.timezone), 'custom'); setOpen(false); }} /> : null}
  </div>;
}
