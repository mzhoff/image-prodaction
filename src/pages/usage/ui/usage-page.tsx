'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@prodactionpro/ui-core/button';
import { RefreshCw, Image, FileText, AudioLines, Video } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { BrandSelect } from '@/shared/ui/brand-select';
import { groupUsage, sumUsage } from '@/modules/usage/core/usage-dashboard';
import { usagePresetPeriod } from '@/modules/usage/core/usage-periods';
import { USAGE_CATEGORIES, USAGE_CATEGORY_LABELS, type UsageCategory, type UsagePreset, type UsageGrain } from '@/modules/usage/contracts/usage-dashboard';
import { useUsageDashboard } from '../model/use-usage-dashboard';
import { usageMoney, usageNumber, usageRangeLabel } from './usage-format';
import { UsageTrend } from './usage-trend';
import { UsagePeriodToolbar } from './usage-period-toolbar';
import { UsageDelta } from './usage-delta';
import './usage.css';

export function UsagePage() {
  const { activeWorkspace } = useWorkspaceShell();
  return activeWorkspace ? <WorkspaceUsage key={activeWorkspace.id} workspaceId={activeWorkspace.id} name={activeWorkspace.name} />
    : <div className="usage-page" role="status">Выбираем Workspace…</div>;
}

function WorkspaceUsage({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [range, setRange] = useState(() => usagePresetPeriod('month'));
  const [preset, setPreset] = useState<UsagePreset>('month');
  const [grain, setGrain] = useState<UsageGrain>('day');
  const [chartMetric, setChartMetric] = useState<'costUsd' | 'requests'>('costUsd');
  const [chartStyle, setChartStyle] = useState<'line' | 'bar'>('line');
  const [category, setCategory] = useState('');
  const [model, setModel] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [sort, setSort] = useState('costUsd');
  const { data, error } = useUsageDashboard(workspaceId, range.from, range.to, range.timezone, refresh);
  const rows = useMemo(() => data?.rows.filter((r) => (!category || r.category === category) && (!model || r.modelId === model)) ?? [], [data, category, model]);
  const total = useMemo(() => sumUsage(rows), [rows]);
  const previous = useMemo(() => sumUsage(data?.comparison.rows.filter((r) => (!category || r.category === category) && (!model || r.modelId === model)) ?? []), [data, category, model]);
  const models = useMemo(() => [...new Set([...(data?.rows.map((r) => r.modelId) ?? []), ...(data?.comparison.rows.map((r) => r.modelId) ?? []), ...(model ? [model] : [])])].sort(), [data, model]);
  const byModel = useMemo(() => groupUsage(rows, (r) => `${r.provider} · ${r.modelId}`).sort((a, b) => {
    const field = sort as 'costUsd' | 'requests' | 'totalTokens';
    return Number(b[field] ?? 0) - Number(a[field] ?? 0) || a.id.localeCompare(b.id);
  }), [rows, sort]);
  const byType = useMemo(() => groupUsage(rows, (r) => r.category).sort((a, b) => b.requests - a.requests), [rows]);
  const delta = (field: Parameters<typeof UsageDelta>[0]['field']) => <UsageDelta current={total} previous={previous} field={field} available={!!data?.comparison.available} />;
  return <div className="usage-page">
    <UsagePeriodToolbar period={range} preset={preset} grain={grain} onChange={(next, selected) => { setRange(next); setPreset(selected); }} onGrainChange={setGrain} />
    <header className="usage-header"><div><h1>Usage</h1><p>Запросы и результаты · {name}</p></div>
      <Button size="sm" appearance="outline" intent="neutral" leadingIcon={<RefreshCw size={15} />} onClick={() => setRefresh((n) => n + 1)}>Обновить</Button>
    </header>
    <section className="usage-filters" aria-label="Фильтры Usage">
      <BrandSelect label="Тип операции" value={category} options={[{ value: '', label: 'Все типы' }, ...USAGE_CATEGORIES.map((c) => ({ value: c, label: USAGE_CATEGORY_LABELS[c] }))]} onChange={setCategory} />
      <BrandSelect label="Модель" value={model} options={[{ value: '', label: 'Все модели' }, ...models.map((m) => ({ value: m, label: m }))]} onChange={setModel} />
    </section>
    {error ? <div className="usage-card usage-error" role="alert">{error}</div> : !data ? <div className="usage-card usage-empty" role="status">Собираем статистику…</div> : <>
      <div className="usage-freshness">Сравнение с {usageRangeLabel(data.comparison.period.from, data.comparison.period.to)}{data.comparison.partial ? ' · оба периода до одинакового времени' : ''} · {data.period.timezone} · обновлено {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: data.period.timezone }).format(new Date(data.generatedAt))}</div>
      <section className="usage-metrics" aria-label="Общая статистика">
        <Metric label="Расходы" value={`${total.unknownCostRequests && total.costUsd !== null ? '≥ ' : ''}${usageMoney(total.costUsd)}`} delta={delta('costUsd')} note={total.unknownCostRequests ? `Без стоимости: ${total.unknownCostRequests} запросов` : 'Подтверждённая стоимость, USD'} />
        <Metric label="Запросы" value={usageNumber(total.requests)} delta={delta('requests')} note="Физические вызовы моделей" />
        <Metric label="Токены" value={`${total.unknownTokenRequests && total.totalTokens !== null ? '≥ ' : ''}${usageNumber(total.totalTokens)}`} delta={delta('totalTokens')} note={total.unknownTokenRequests ? `Неполные данные: ${total.unknownTokenRequests} запросов` : 'Входящие + исходящие'} />
        <Metric label="Ошибки" value={usageNumber(total.failed)} delta={delta('failed')} note={`${total.succeeded} успешно · ${total.unconfirmed} без подтверждения`} />
      </section>
      <section className="usage-results" aria-label="Сгенерированные результаты">{[
        { label: 'Изображения', key: 'images' as const, Icon: Image }, { label: 'Тексты', key: 'texts' as const, Icon: FileText },
        { label: 'Голос', key: 'audio' as const, Icon: AudioLines }, { label: 'Видео', key: 'video' as const, Icon: Video },
      ].map(({ label, key, Icon }) => <div className="usage-card usage-result" key={key}><Icon size={21} /><div><span>{label}</span><div className="usage-value"><strong>{usageNumber(total[key])}</strong>{delta(key)}</div><small>успешных генераций</small></div></div>)}</section>
      {!rows.length ? <div className="usage-card usage-empty">За выбранный период и с этими фильтрами данных нет.</div> : <>
        <UsageTrend rows={rows} period={data.period} grain={grain} through={data.comparison.currentThrough} metric={chartMetric} setMetric={setChartMetric} style={chartStyle} setStyle={setChartStyle} />
        <section className="usage-card" aria-labelledby="usage-models-title"><div className="usage-section-heading"><h2 id="usage-models-title">По моделям</h2>
          <BrandSelect label="Сортировка" value={sort} options={[{ value: 'costUsd', label: 'По расходам' }, { value: 'requests', label: 'По запросам' }, { value: 'totalTokens', label: 'По токенам' }]} onChange={setSort} /></div>
          <div className="usage-table-scroll"><table><thead><tr><th>Провайдер / модель</th><th>Запросы</th><th>Ошибки</th><th>Входящие токены</th><th>Исходящие токены</th><th>Всего токенов</th><th>Расходы</th></tr></thead>
            <tbody>{byModel.map((row) => <tr key={row.id}><th scope="row">{row.id}<small>{row.unconfirmed ? `Без подтверждения: ${row.unconfirmed}` : ''}</small></th><td>{usageNumber(row.requests)}</td><td>{usageNumber(row.failed)}</td>
              <td>{usageNumber(row.inputTokens)}</td><td>{usageNumber(row.outputTokens)}</td><td>{usageNumber(row.totalTokens)}{row.unknownTokenRequests ? <small>Неполные данные: {row.unknownTokenRequests}</small> : null}</td>
              <td>{row.unknownCostRequests && row.costUsd !== null ? '≥ ' : ''}{usageMoney(row.costUsd)}{row.unknownCostRequests ? <small>Без стоимости: {row.unknownCostRequests}</small> : null}</td></tr>)}</tbody></table></div>
        </section>
        <section className="usage-card" aria-labelledby="usage-types-title"><h2 id="usage-types-title">По типам операций</h2><div className="usage-type-grid">{byType.map((r) => <button type="button" key={r.id} className="usage-type" onClick={() => setCategory(r.id)}>
          <strong>{USAGE_CATEGORY_LABELS[r.id as UsageCategory]}</strong><span>{usageNumber(r.requests)} запросов</span><b>{r.unknownCostRequests && r.costUsd !== null ? '≥ ' : ''}{usageMoney(r.costUsd)}</b></button>)}</div></section>
      </>}
      <details className="usage-card usage-methods"><summary>Как считается статистика</summary>
        <p>Источник: журналы генераций Image Production и вызовов ChatModule только выбранного Workspace. Один запрос — один вызов модели; повторная отправка считается отдельно, опрос статуса и уточнение стоимости — нет. Очередь без отправки провайдеру не входит в запросы.</p>
        <p>Запросы относятся к дню первого наблюдения вызова, результаты — к дню завершения. Счётчики результатов показывают успешные операции генерации: в том числе редактирование изображений; тексты — Generate Text и форматирование. Анализ, транскрибация, ответы чата, импорты и сохранённые копии не увеличивают эти счётчики.</p>
        <p>Расходы включают известную стоимость успешных и неудачных вызовов, не являются балансом и не включают другие приложения с тем же API-ключом. «≥» означает известную часть суммы; «—» — нет данных. Старый чатовый журнал не различает неизвестную стоимость и нулевую: такие нули показаны как неизвестные. Счётчики токенов не заменяют оплату видео или аудио.</p>
        <p>Исторические вызовы, для которых нет ни записи журнала, ни отметки отправки, восстановить точно нельзя. Показатели кэша и reasoning отдельно не выводятся: единых достоверных полей в текущем журнале нет.</p>
        <p>Процент = (значение периода − значение предыдущего периода) / значение предыдущего периода × 100. Предыдущий период непосредственно предшествует выбранному и содержит столько же дней. Для незавершённого периода сравниваются одинаковые по длительности части. Модель и тип операции применяются к обоим периодам. «Ранее 0» — рост с нулевой базы, «Нет сравнения» — недостаточно данных; рост расходов сам по себе не считается улучшением.</p>
      </details>
    </>}
  </div>;
}
function Metric({ label, value, note, delta }: { label: string; value: string; note: string; delta: ReactNode }) {
  return <div className="usage-card usage-metric"><span>{label}</span><div className="usage-value"><strong>{value}</strong>{delta}</div><small>{note}</small></div>;
}
