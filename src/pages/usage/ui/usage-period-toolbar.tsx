'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from '@prodactionpro/ui-core/icons';
import type { UsageGrain, UsagePeriod, UsagePreset } from '@/modules/usage/contracts/usage-dashboard';
import { usagePeriod } from '@/modules/usage/core/usage-dashboard';
import { usagePresetPeriod } from '@/modules/usage/core/usage-periods';
import { usageRangeLabel } from './usage-format';

const PRESETS = [{ id: 'today', label: 'Сегодня' }, { id: 'yesterday', label: 'Вчера' }, { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' }, { id: 'quarter', label: 'Квартал' }] as const;

export function UsagePeriodToolbar({ period, preset, grain, onChange, onGrainChange }: {
  period: UsagePeriod; preset: UsagePreset; grain: UsageGrain;
  onChange: (period: UsagePeriod, preset: UsagePreset) => void; onGrainChange: (grain: UsageGrain) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: period.from, to: period.to });
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function apply() {
    try { const next = usagePeriod(draft.from, draft.to, period.timezone); onChange(next, 'custom'); setOpen(false); trigger.current?.focus(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Проверьте период.'); }
  }
  return <div className="usage-period-toolbar" aria-label="Период и детализация">
    <div className="usage-period-group">
      <div className="usage-presets" role="group" aria-label="Быстрый выбор периода">{PRESETS.map((p) =>
        <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => onChange(usagePresetPeriod(p.id, period.timezone), p.id)}>{p.label}</button>)}</div>
      <div className="usage-range-picker" ref={root}>
        <button type="button" className="usage-range-trigger" ref={trigger} aria-label="Свой период" aria-haspopup="dialog" aria-expanded={open}
          onClick={() => { setDraft({ from: period.from, to: period.to }); setError(''); setOpen(!open); }}>
          {usageRangeLabel(period.from, period.to)}<ChevronDown size={13} />
        </button>
        {open ? <div className="usage-range-popover" role="dialog" aria-label="Выбор диапазона дат">
          <strong>Свой период</strong>
          <label>С<input type="date" aria-label="Начало периода" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label>По<input type="date" aria-label="Конец периода" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          {error ? <span role="alert">{error}</span> : null}
          <div><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Отмена</button><button type="button" onClick={apply}>Применить</button></div>
        </div> : null}
      </div>
    </div>
    <select className="usage-compact-select" aria-label="Детализация графика" value={grain} onChange={(e) => onGrainChange(e.target.value as UsageGrain)}>
      <option value="day">По дням</option><option value="week">По неделям</option><option value="month">По месяцам</option>
    </select>
    <select className="usage-compact-select" aria-label="Часовой пояс" value={period.timezone} onChange={(e) => {
      onChange(preset === 'custom' ? usagePeriod(period.from, period.to, e.target.value) : usagePresetPeriod(preset, e.target.value), preset);
    }}><option value="Europe/Moscow">UTC+3</option><option value="UTC">UTC</option></select>
  </div>;
}
