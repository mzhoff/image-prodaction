'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, SlidersHorizontal, Image, FileText, AudioLines, Video } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';
import { useKeyBudget } from '@/features/provider-budget/model/use-key-budget';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { usagePeriod } from '@/modules/usage/core/usage-dashboard';
import { FilterSelect } from '@/shared/ui/filter-select';
import { averageUsageCost, groupUsage, sumUsage } from '@/modules/usage/core/usage-dashboard';
import { usagePresetPeriod } from '@/modules/usage/core/usage-periods';
import { USAGE_CATEGORIES, USAGE_CATEGORY_LABELS, type UsageCategory, type UsagePreset, type UsageGrain } from '@/modules/usage/contracts/usage-dashboard';
import { useUsageDashboard } from '../model/use-usage-dashboard';
import { useUsageFormat } from './use-usage-format';
import { usageNeedsFunding } from '../model/usage-empty-state';
import { UsageTrend } from './usage-trend';
import { UsagePeriodToolbar } from './usage-period-toolbar';
import { UsageDelta } from './usage-delta';
import { useUsageModels } from '../model/use-usage-models';
import { UsageModel } from './usage-model';
import { UsageBalance } from './usage-balance';
import './usage.css';

export function UsagePage() {
  const tUi = useTranslations();
  const { activeWorkspace } = useWorkspaceShell();
  return activeWorkspace ? <WorkspaceUsage key={activeWorkspace.id} workspaceId={activeWorkspace.id} name={activeWorkspace.name} />
    : <div className="usage-page" role="status">{tUi("Выбираем Workspace…")}</div>;
}

function WorkspaceUsage({ workspaceId, name }: { workspaceId: string; name: string }) {
  const { usageAverageMoney, usageMoney, usageNumber } = useUsageFormat();
  const tUi = useTranslations();
  const ui_USAGE_CATEGORY_LABELS = useUiCatalog(USAGE_CATEGORY_LABELS, tUi);
  const openSubscriptions = useSubscriptions();
  const modelCatalog = useUsageModels();
  const [range, setRange] = useState(() => usagePresetPeriod('month'));
  const [preset, setPreset] = useState<UsagePreset>('month');
  const [grain, setGrain] = useState<UsageGrain>('day');
  const [chartMetric, setChartMetric] = useState<'costUsd' | 'requests'>('costUsd');
  const [chartStyle, setChartStyle] = useState<'line' | 'bar'>('line');
  const [category, setCategory] = useState('');
  const [model, setModel] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [sort, setSort] = useState('costUsd');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = Number(Boolean(category)) + Number(Boolean(model)) + Number(grain !== 'day') + Number(range.timezone !== 'Europe/Moscow');
  const { data, error } = useUsageDashboard(workspaceId, range.from, range.to, range.timezone, refresh);
  const balance = useKeyBudget(workspaceId, refresh);
  const needsFunding = usageNeedsFunding(balance.data, balance.error);
  const rows = useMemo(() => data?.rows.filter((r) => (!category || r.category === category) && (!model || r.modelId === model)) ?? [], [data, category, model]);
  const total = useMemo(() => sumUsage(rows), [rows]);
  const previous = useMemo(() => sumUsage(data?.comparison.rows.filter((r) => (!category || r.category === category) && (!model || r.modelId === model)) ?? []), [data, category, model]);
  const models = useMemo(() => [...new Set([...(data?.rows.map((r) => r.modelId) ?? []), ...(data?.comparison.rows.map((r) => r.modelId) ?? []), ...(model ? [model] : [])])].sort(), [data, model]);
  const byModel = useMemo(() => groupUsage(rows, (r) => r.modelId).sort((a, b) => {
    const field = sort as 'costUsd' | 'requests' | 'totalTokens';
    return Number(b[field] ?? 0) - Number(a[field] ?? 0) || a.id.localeCompare(b.id);
  }), [rows, sort]);
  const byType = useMemo(() => groupUsage(rows, (r) => r.category).sort((a, b) => b.requests - a.requests), [rows]);
  const empty = Boolean(data && !rows.length);
  const delta = (field: Parameters<typeof UsageDelta>[0]['field']) => <UsageDelta current={total} previous={previous} field={field} available={!!data?.comparison.available} />;
  return <ProductionSectionLayout title={tUi("Использование")} className="usage-page" tools={<>
    <span className="usage-workspace-name">{name}</span>
    <button className="section-tool-button" type="button" aria-label={tUi("Обновить статистику")} title={tUi("Обновить")} onClick={() => setRefresh((n) => n + 1)}><RefreshCw size={17} /></button>
    <button className="section-tool-button usage-filter-toggle" type="button" aria-label={filterCount ? tUi("Фильтры: {p1}", { p1: filterCount }) : tUi("Фильтры")} title={tUi("Фильтры")} aria-expanded={filtersOpen} aria-controls="usage-filters" data-active={filtersOpen || filterCount > 0} onClick={() => setFiltersOpen((open) => !open)}>
      <SlidersHorizontal size={17} />{filterCount > 0 ? <span>{filterCount}</span> : null}
    </button>
  </>} actions={<button className="usage-funding-button" type="button" onClick={() => openSubscriptions({ workspaceId, tab: 'budget', source: 'usage_header' })}>{tUi("Пополнить баланс")}</button>} controls={<>
    <UsagePeriodToolbar period={range} preset={preset} onChange={(next, selected) => { setRange(next); setPreset(selected); }} />
    {filtersOpen ? <section id="usage-filters" className="usage-filter-panel" aria-label={tUi("Фильтры")}>
      <div className="usage-filter-heading"><h2>{tUi("Фильтры")}</h2>{filterCount > 0 ? <button type="button" onClick={() => { setCategory(''); setModel(''); setGrain('day'); setRange(preset === 'custom' ? usagePeriod(range.from, range.to, 'Europe/Moscow') : usagePresetPeriod(preset, 'Europe/Moscow')); }}>{tUi("Сбросить")}</button> : null}</div>
      <div className="usage-filters">
        <FilterSelect label={tUi("Тип операции")} value={category} options={[{ value: '', label: tUi("Все типы") }, ...USAGE_CATEGORIES.map((c) => ({ value: c, label: ui_USAGE_CATEGORY_LABELS[c] }))]} onChange={setCategory} />
        <FilterSelect label={tUi("Модель")} value={model} options={[{ value: '', label: tUi("Все модели") }, ...models.map((m) => ({ value: m, label: modelCatalog.label(m) }))]} onChange={setModel} />
        <FilterSelect label={tUi("Детализация")} value={grain} onChange={(value) => setGrain(value as UsageGrain)} options={[{ value: 'day', label: tUi("По дням") }, { value: 'week', label: tUi("По неделям") }, { value: 'month', label: tUi("По месяцам") }]} />
        <FilterSelect label={tUi("Часовой пояс")} value={range.timezone} onChange={(value) => setRange(preset === 'custom' ? usagePeriod(range.from, range.to, value) : usagePresetPeriod(preset, value))} options={[{ value: 'Europe/Moscow', label: 'UTC+3' }, { value: 'UTC', label: 'UTC' }]} />
      </div>
    </section> : null}
  </>}>
      <section className="usage-metrics" data-empty={empty || undefined} aria-label={tUi("Общая статистика")}>
        <UsageBalance resource={balance} />
        <Metric label={tUi("Расходы")} value={!data ? '—' : `${total.unknownCostRequests && total.costUsd !== null ? '≥ ' : ''}${usageMoney(total.costUsd)}`} delta={data && delta('costUsd')} note={total.unknownCostRequests ? tUi("Без стоимости: {p1} запросов", { p1: total.unknownCostRequests }) : tUi("Подтверждённая стоимость, USD")} />
        <Metric label={tUi("Запросы")} value={data ? usageNumber(total.requests) : '—'} delta={data && delta('requests')} note={tUi("Физические вызовы моделей")} />
        <Metric label={tUi("Токены")} value={!data ? '—' : `${total.unknownTokenRequests && total.totalTokens !== null ? '≥ ' : ''}${usageNumber(total.totalTokens)}`} delta={data && delta('totalTokens')} note={total.unknownTokenRequests ? tUi("Неполные данные: {p1} запросов", { p1: total.unknownTokenRequests }) : tUi("Входящие + исходящие")} />
      </section>

    {error ? <div className="usage-card usage-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</div> : !data ? <div className="usage-card usage-empty" role="status">{tUi("Собираем статистику…")}</div> : <>
      <section className="usage-results" data-empty={empty || undefined} aria-label={tUi("Сгенерированные результаты")}>{[
        { label: tUi("Изображения"), key: 'images' as const, Icon: Image }, { label: tUi("Тексты"), key: 'texts' as const, Icon: FileText },
        { label: tUi("Голос"), key: 'audio' as const, Icon: AudioLines }, { label: tUi("Видео"), key: 'video' as const, Icon: Video },
      ].map(({ label, key, Icon }) => <div className="usage-card usage-result" key={key}><Icon size={21} /><div><span>{label}</span><div className="usage-value"><strong>{usageNumber(total[key])}</strong>{delta(key)}</div><small>{tUi("успешных генераций")}</small></div></div>)}</section>
      {empty ? <ProductionEmptyState kind="usage" compact
        title={needsFunding ? tUi("Откройте возможности AI") : tUi("За этот период данных нет")}
        description={needsFunding ? tUi("Пополните баланс — здесь появится статистика ваших работ.") : tUi("Попробуйте другой период или измените фильтры.")}
        action={needsFunding ? { label: tUi("Пополнить баланс"), onClick: () => openSubscriptions({ workspaceId, tab: 'budget', source: 'usage_empty' }) } : undefined} /> : <>
        <UsageTrend rows={rows} period={data.period} grain={grain} through={data.comparison.currentThrough} metric={chartMetric} setMetric={setChartMetric} style={chartStyle} setStyle={setChartStyle} modelLabel={modelCatalog.label} />
        <section className="usage-card" aria-labelledby="usage-models-title"><div className="usage-section-heading"><h2 id="usage-models-title">{tUi("По моделям")}</h2>
          <FilterSelect label={tUi("Сортировка")} value={sort} options={[{ value: 'costUsd', label: tUi("По расходам") }, { value: 'requests', label: tUi("По запросам") }, { value: 'totalTokens', label: tUi("По токенам") }]} onChange={setSort} /></div>
          <div className="usage-table-scroll"><table><thead><tr><th>{tUi("Модель")}</th><th>{tUi("Запросы")}</th><th>{tUi("Ошибки")}</th><th>{tUi("Входящие токены")}</th><th>{tUi("Исходящие токены")}</th><th>{tUi("Всего токенов")}</th><th>{tUi("Расходы")}</th><th title={tUi("Общие расходы ÷ число запросов за выбранный период")}>{tUi("Средняя стоимость запроса")}</th></tr></thead>
            <tbody>{byModel.map((row) => <tr key={row.id}><th scope="row"><UsageModel id={row.id} name={modelCatalog.label(row.id)} video={modelCatalog.isVideo(row.id)} /><small>{row.unconfirmed ? tUi("Без подтверждения: {p1}", { p1: row.unconfirmed }) : ''}</small></th><td>{usageNumber(row.requests)}</td><td>{usageNumber(row.failed)}</td>
              <td>{usageNumber(row.inputTokens)}</td><td>{usageNumber(row.outputTokens)}</td><td>{usageNumber(row.totalTokens)}{row.unknownTokenRequests ? <small>{tUi("Неполные данные:")}{' '} {row.unknownTokenRequests}</small> : null}</td>
              <td>{row.unknownCostRequests && row.costUsd !== null ? '≥ ' : ''}{usageMoney(row.costUsd)}{row.unknownCostRequests ? <small>{tUi("Без стоимости:")}{' '} {row.unknownCostRequests}</small> : null}</td><td>{usageAverageMoney(averageUsageCost(row))}{row.unknownCostRequests ? <small>{tUi("Неполные данные")}</small> : null}</td></tr>)}</tbody></table></div>
        </section>
        <section className="usage-card" aria-labelledby="usage-types-title"><h2 id="usage-types-title">{tUi("По типам операций")}</h2><div className="usage-type-grid">{byType.map((r) => <button type="button" key={r.id} className="usage-type" onClick={() => setCategory(r.id)}>
          <strong>{ui_USAGE_CATEGORY_LABELS[r.id as UsageCategory]}</strong><span>{usageNumber(r.requests)}  {' '}{tUi("запросов")}</span><b>{r.unknownCostRequests && r.costUsd !== null ? '≥ ' : ''}{usageMoney(r.costUsd)}</b></button>)}</div></section>
      </>}

    </>}
  </ProductionSectionLayout>;
}
function Metric({ label, value, note, delta }: { label: string; value: string; note: string; delta: ReactNode }) {
  return <div className="usage-card usage-metric"><span>{label}</span><div className="usage-value"><strong>{value}</strong>{delta}</div><small>{note}</small></div>;
}
