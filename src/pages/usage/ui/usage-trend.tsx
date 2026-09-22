'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { UsageDashboardRow, UsageGrain, UsagePeriod } from '@/modules/usage/contracts/usage-dashboard';
import { buildUsageChart, usageChartMax, usageLinePath, USAGE_OTHER_MODEL } from '@/modules/usage/core/usage-chart';
import { useUsageFormat } from './use-usage-format';

import { sumUsage } from '@/modules/usage/core/usage-dashboard';
import { UsageChartTooltip, type UsageChartHover } from './usage-chart-tooltip';

const COLORS = ['#9873fb', '#ef58a8', '#18bca0', '#5b92ed', '#ffb74f', '#99a4bb'];
export function UsageTrend({ rows, period, grain, through, metric, setMetric, style, setStyle, modelLabel }: {
  rows: UsageDashboardRow[]; period: UsagePeriod; grain: UsageGrain; through: string;
  metric: 'costUsd' | 'requests'; setMetric: (metric: 'costUsd' | 'requests') => void;
  style: 'line' | 'bar'; setStyle: (style: 'line' | 'bar') => void; modelLabel: (id: string) => string;
}) {
  const { usageDate, usageMoney, usageNumber, usageRangeLabel } = useUsageFormat();
  const tUi = useTranslations();
  const [hover, setHover] = useState<UsageChartHover | null>(null);
  const selected = hover?.id;
  const tooltipId = useId();
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
  useEffect(() => {
    const dismiss = () => setHover(null);
    const onScroll = () => setHover((current) => {
      const element = document.activeElement;
      if (!current?.keyboard || !(element instanceof SVGRectElement) || !scrollRef.current?.contains(element)) return null;
      const bounds = element.getBoundingClientRect();
      return { ...current, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', dismiss); window.removeEventListener('keydown', onKey); };
  }, []);
  const chart = useMemo(() => buildUsageChart(rows, period, grain), [rows, period, grain]);
  const throughDay = new Intl.DateTimeFormat('en-CA', { timeZone: period.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(through));
  const visible = useMemo(() => chart.series.map((model, index) => ({ model, index })).filter(({ model }) => !hidden.includes(model)), [chart, hidden]);
  const totals = useMemo(() => chart.points.map((point) => sumUsage(visible.map(({ index }) => point.values[index]!))), [chart, visible]);
  const values = useMemo(() => chart.points.map((point) => point.values.map((v) => point.from > throughDay || v[metric] === null ? null : Number(v[metric]))), [chart, metric, throughDay]);
  const max = usageChartMax(Math.max(0, ...values.map((v) => style === 'bar'
    ? visible.reduce((sum, { index }) => sum + (v[index] ?? 0), 0) : Math.max(0, ...visible.map(({ index }) => v[index] ?? 0)))), metric === 'requests');
  const left = 64, right = width - 18, top = 14, bottom = 218, step = (right - left) / chart.points.length;
  const x = (index: number) => left + step * (index + .5), y = (value: number) => bottom - value / max * (bottom - top);
  const focused = chart.points.find((point) => point.id === selected);
  const value = (v: string | number | null) => metric === 'costUsd' ? usageMoney(v === null ? null : String(v)) : usageNumber(v);
  const label = (from: string, to: string) => from === to ? usageDate(from) : usageRangeLabel(from, to);
  const name = (id: string) => id === USAGE_OTHER_MODEL ? tUi("Другие модели") : modelLabel(id);
  const focusPoint = (id: string, element: SVGRectElement) => {
    const bounds = element.getBoundingClientRect();
    setHover({ id, keyboard: true, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  };
  const tickEvery = Math.max(1, Math.ceil(chart.points.length / Math.floor(width / 110)));
  return <section className="usage-card usage-trend" aria-labelledby="usage-trend-title">
    <div className="usage-section-heading"><div><h2 id="usage-trend-title">{tUi("Динамика по моделям")}</h2><p className="usage-chart-subtitle">{metric === 'costUsd' ? tUi("Известные расходы, USD") : tUi("Количество запросов")} · {grain === 'day' ? tUi("по дням") : grain === 'week' ? tUi("по неделям") : tUi("по месяцам")}</p></div>
      <div className="usage-chart-controls"><div className="usage-segments" aria-label={tUi("Показатель графика")}>
        <button type="button" aria-pressed={metric === 'costUsd'} onClick={() => setMetric('costUsd')}>{tUi("Расходы")}</button>
        <button type="button" aria-pressed={metric === 'requests'} onClick={() => setMetric('requests')}>{tUi("Запросы")}</button>
      </div><div className="usage-segments usage-chart-style" aria-label={tUi("Вид графика")}>
        <button type="button" title={tUi("Линейный график")} aria-label={tUi("Линейный график")} aria-pressed={style === 'line'} onClick={() => setStyle('line')}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3v14h14M5 12l4-6 4 4 4-5" /></svg></button>
        <button type="button" title={tUi("Столбчатый график")} aria-label={tUi("Столбчатый график")} aria-pressed={style === 'bar'} onClick={() => setStyle('bar')}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3v14h14M7 13V9m4 4V5m4 8V7" /></svg></button>
      </div></div>
    </div>
    <div className="usage-chart-scroll" ref={scrollRef} onMouseLeave={() => setHover((current) => current?.keyboard ? current : null)}>
      <svg className="usage-plot" width={width} height="252" viewBox={`0 0 ${width} 252`} role="group" aria-label={tUi("{p1} график: {p2}", { p1: style === 'line' ? 'Линейный' : 'Столбчатый', p2: metric === 'costUsd' ? 'расходы' : 'запросы' })}>
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
            onFocus={(event) => focusPoint(point.id, event.currentTarget)} onBlur={() => setHover(null)}
            onMouseMove={(event) => setHover({ id: point.id, x: event.clientX, y: event.clientY })} onClick={(event) => focusPoint(point.id, event.currentTarget)}
            aria-describedby={selected === point.id ? tooltipId : undefined}
            onKeyDown={(event) => { if (event.key === 'Escape') setHover(null);
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusPoint(point.id, event.currentTarget); } }}
            aria-label={`${label(point.from, point.to)}: ${point.from > throughDay ? tUi("период ещё не наступил") : value(totals[index]![metric])}${totals[index]!.unknownCostRequests && metric === 'costUsd' ? tUi(", стоимость части запросов неизвестна") : ''}`} />
          {(index === chart.points.length - 1 || (index % tickEvery === 0 && index < chart.points.length - 1 - Math.floor(tickEvery / 2))) && <text className="usage-axis" aria-hidden="true" x={index === 0 ? left : index === chart.points.length - 1 ? right : x(index)} y={242} textAnchor={index === 0 ? 'start' : index === chart.points.length - 1 ? 'end' : 'middle'}>{usageDate(point.from)}</text>}
        </g>)}
      </svg>
    </div>
    <div className="usage-legend" aria-label={tUi("Модели на графике")}>{chart.series.map((model, index) => <button type="button" key={model} aria-pressed={!hidden.includes(model)}
      style={{ '--usage-series-color': COLORS[index] } as CSSProperties}
      onClick={() => { setHover(null); setHidden((current) => current.includes(model) ? current.filter((id) => id !== model) : [...current, model]); }}><i aria-hidden="true" /><span>{name(model)}</span></button>)}</div>
    {!visible.length ? <p className="usage-chart-subtitle" role="status">{tUi("Включите модели под графиком, чтобы увидеть данные.")}</p> : null}
    {focused && hover ? <UsageChartTooltip id={tooltipId} position={hover} date={label(focused.from, focused.to)} future={focused.from > throughDay}
      models={visible.map(({ model, index }) => ({ name: name(model), color: COLORS[index]!, value: focused.values[index]! }))} /> : null}
  </section>;
}
