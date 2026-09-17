'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UsageDashboardRow, UsageGrain, UsagePeriod } from '@/modules/usage/contracts/usage-dashboard';
import { buildUsageChart, usageChartMax, usageLinePath, USAGE_OTHER_MODEL } from '@/modules/usage/core/usage-chart';
import { usageDate, usageMoney, usageNumber, usageRangeLabel } from './usage-format';

const COLORS = ['#9873fb', '#ef58a8', '#18bca0', '#5b92ed', '#ffb74f', '#99a4bb'];
export function UsageTrend({ rows, period, grain, through, metric, setMetric, style, setStyle }: {
  rows: UsageDashboardRow[]; period: UsagePeriod; grain: UsageGrain; through: string;
  metric: 'costUsd' | 'requests'; setMetric: (metric: 'costUsd' | 'requests') => void;
  style: 'line' | 'bar'; setStyle: (style: 'line' | 'bar') => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [width, setWidth] = useState(960);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(600, Math.floor(entry!.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const chart = useMemo(() => buildUsageChart(rows, period, grain), [rows, period, grain]);
  const throughDay = new Intl.DateTimeFormat('en-CA', { timeZone: period.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(through));
  const visible = chart.series.map((model, index) => ({ model, index })).filter(({ model }) => !hidden.includes(model));
  const values = chart.points.map((point) => point.values.map((v) => point.from > throughDay || v[metric] === null ? null : Number(v[metric])));
  const max = usageChartMax(Math.max(0, ...values.map((v) => style === 'bar'
    ? visible.reduce((sum, { index }) => sum + (v[index] ?? 0), 0) : Math.max(0, ...visible.map(({ index }) => v[index] ?? 0)))), metric === 'requests');
  const left = 64, right = width - 18, top = 14, bottom = 218, step = (right - left) / chart.points.length;
  const x = (index: number) => left + step * (index + .5), y = (value: number) => bottom - value / max * (bottom - top);
  const focused = chart.points.find((point) => point.id === selected);
  const value = (v: string | number | null) => metric === 'costUsd' ? usageMoney(v === null ? null : String(v)) : usageNumber(v);
  const label = (from: string, to: string) => from === to ? usageDate(from) : usageRangeLabel(from, to);
  const tickEvery = Math.max(1, Math.ceil(chart.points.length / Math.floor(width / 110)));
  return <section className="usage-card usage-trend" aria-labelledby="usage-trend-title">
    <div className="usage-section-heading"><div><h2 id="usage-trend-title">Динамика по моделям</h2><p className="usage-chart-subtitle">{metric === 'costUsd' ? 'Известные расходы, USD' : 'Количество запросов'} · {grain === 'day' ? 'по дням' : grain === 'week' ? 'по неделям' : 'по месяцам'}</p></div>
      <div className="usage-chart-controls"><div className="usage-segments" aria-label="Показатель графика">
        <button type="button" aria-pressed={metric === 'costUsd'} onClick={() => setMetric('costUsd')}>Расходы</button>
        <button type="button" aria-pressed={metric === 'requests'} onClick={() => setMetric('requests')}>Запросы</button>
      </div><div className="usage-segments usage-chart-style" aria-label="Вид графика">
        <button type="button" title="Линейный график" aria-label="Линейный график" aria-pressed={style === 'line'} onClick={() => setStyle('line')}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3v14h14M5 12l4-6 4 4 4-5" /></svg></button>
        <button type="button" title="Столбчатый график" aria-label="Столбчатый график" aria-pressed={style === 'bar'} onClick={() => setStyle('bar')}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3v14h14M7 13V9m4 4V5m4 8V7" /></svg></button>
      </div></div>
    </div>
    <div className="usage-chart-scroll" ref={scrollRef}>
      <svg className="usage-plot" width={width} height="252" viewBox={`0 0 ${width} 252`} role="group" aria-label={`${style === 'line' ? 'Линейный' : 'Столбчатый'} график: ${metric === 'costUsd' ? 'расходы' : 'запросы'}`}>
        {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction} aria-hidden="true"><line className="usage-gridline" x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} /><text className="usage-axis" x={left - 12} y={y(max * fraction) + 4} textAnchor="end">{value(max * fraction)}</text></g>)}
        {style === 'line' ? visible.map(({ model, index }) => <g key={model} aria-hidden="true">
          <path className="usage-line" stroke={COLORS[index]} d={usageLinePath(values.map((v) => v[index] ?? null), x, y)} />
          {chart.points.map((point, p) => values[p]![index] !== null && (point.id === selected || p === chart.points.length - 1 || (values[p - 1]?.[index] == null && values[p + 1]?.[index] == null))
            ? <circle key={point.id} cx={x(p)} cy={y(values[p]![index]!)} r={3} fill={COLORS[index]} /> : null)}
        </g>) : chart.points.map((point, p) => {
          let stacked = 0;
          return <g key={point.id} aria-hidden="true">{visible.map(({ model, index }) => {
            const v = values[p]![index]; if (!v) return null;
            stacked += v;
            return <rect className="usage-bar" key={model} x={x(p) - Math.min(36, step * .7) / 2} y={y(stacked)} width={Math.min(36, step * .7)} height={bottom - y(v)} fill={COLORS[index]} />;
          })}</g>;
        })}
        {chart.points.map((point, index) => <g key={point.id}>
          {point.id === selected && <line className="usage-crosshair" x1={x(index)} x2={x(index)} y1={top} y2={bottom} aria-hidden="true" />}
          <rect className="usage-point-target" role="button" tabIndex={0} x={left + step * index} y={top} width={step} height={bottom - top}
            onFocus={() => setSelected(point.id)} onMouseEnter={() => setSelected(point.id)} onClick={() => setSelected(point.id)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(point.id); } }}
            aria-label={`${label(point.from, point.to)}: ${point.from > throughDay ? 'период ещё не наступил' : value(point.total[metric])}${point.total.unknownCostRequests && metric === 'costUsd' ? ', стоимость части запросов неизвестна' : ''}`} />
          {(index === chart.points.length - 1 || (index % tickEvery === 0 && index < chart.points.length - 1 - Math.floor(tickEvery / 2))) && <text className="usage-axis" aria-hidden="true" x={index === 0 ? left : index === chart.points.length - 1 ? right : x(index)} y={242} textAnchor={index === 0 ? 'start' : index === chart.points.length - 1 ? 'end' : 'middle'}>{usageDate(point.from)}</text>}
        </g>)}
      </svg>
    </div>
    <div className="usage-chart-detail" aria-live="polite">{focused
      ? <><strong>{label(focused.from, focused.to)}</strong><span>{focused.from > throughDay ? 'Период ещё не наступил' : <>Всего: {value(focused.total[metric])} · {usageNumber(focused.total.requests)} запросов{metric === 'costUsd' && focused.total.unknownCostRequests ? ` · без стоимости: ${focused.total.unknownCostRequests}` : ''}</>}</span>
        {visible.map(({ model, index }) => <span key={model}><i style={{ background: COLORS[index] }} />{model === USAGE_OTHER_MODEL ? 'Другие модели' : model}: {focused.from > throughDay ? '—' : value(focused.values[index]![metric])}</span>)}</>
      : <span>Наведите на график или выберите период клавиатурой. Модели можно скрывать в легенде.</span>}</div>
    <div className="usage-legend">{chart.series.map((model, index) => <label key={model}><input type="checkbox" checked={!hidden.includes(model)} onChange={() => setHidden((current) => current.includes(model) ? current.filter((id) => id !== model) : [...current, model])} style={{ accentColor: COLORS[index] }} /><span>{model === USAGE_OTHER_MODEL ? 'Другие модели' : model}</span></label>)}</div>
    <details className="usage-details"><summary>Данные графика</summary><div className="usage-table-scroll"><table><thead><tr><th>Период</th><th>Запросы</th><th>Расходы, USD</th><th>Без стоимости</th></tr></thead>
      <tbody>{chart.points.map((d) => <tr key={d.id}><td>{label(d.from, d.to)}</td><td>{d.from > throughDay ? '—' : d.total.requests}</td><td>{d.from > throughDay ? '—' : `${d.total.unknownCostRequests && d.total.costUsd !== null ? '≥ ' : ''}${usageMoney(d.total.costUsd)}`}</td><td>{d.total.unknownCostRequests}</td></tr>)}</tbody></table></div></details>
  </section>;
}
