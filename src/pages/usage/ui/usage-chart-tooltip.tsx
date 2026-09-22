'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { UsageMeasures } from '@/modules/usage/contracts/usage-dashboard';
import { sumUsage } from '@/modules/usage/core/usage-dashboard';
import { useUsageFormat } from './use-usage-format';

export type UsageChartHover = { id: string; x: number; y: number; keyboard?: boolean };
export function UsageChartTooltip({ id, position, date, future, models }: {
  id: string; position: UsageChartHover; date: string; future: boolean;
  models: { name: string; color: string; value: UsageMeasures }[];
}) {
  const { usageMoney, usageNumber } = useUsageFormat();
  const tUi = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const x = position.x + 16 + width > window.innerWidth ? position.x - width - 16 : position.x + 16;
    const y = position.y + 18 + height > window.innerHeight ? position.y - height - 18 : position.y + 18;
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  });
  const total = sumUsage(models.map((model) => model.value));
  const cost = (value: UsageMeasures) => `${value.unknownCostRequests && value.costUsd !== null ? '≥ ' : ''}${usageMoney(value.costUsd)}`;
  return createPortal(<div ref={ref} id={id} role="tooltip" className="usage-chart-tooltip">
    <strong>{date}</strong>
    {future ? <p>{tUi("Период ещё не наступил")}</p> : !models.length ? <p>{tUi("Включите модели под графиком")}</p> : <>
      <div className="usage-tooltip-total"><span>{tUi("Расходы выбранных моделей")}</span><b>{cost(total)}</b></div>
      <small>{usageNumber(total.requests)}  {' '}{tUi("запросов")}</small>
      <div className="usage-tooltip-models">{models.map((model, index) => <div key={index}>
        <i style={{ background: model.color }} /><span>{model.name}<small>{usageNumber(model.value.requests)}  {' '}{tUi("запросов")}</small></span><b>{cost(model.value)}</b>
      </div>)}</div>
      {total.unknownCostRequests > 0 ? <p>{tUi("Стоимость неизвестна для")}{' '} {usageNumber(total.unknownCostRequests)}  {' '}{tUi("запросов")}</p> : null}
    </>}
  </div>, document.body);
}
