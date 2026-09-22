'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';
import type { UsageMeasures } from '@/modules/usage/contracts/usage-dashboard';
import { usageChange } from '@/modules/usage/core/usage-periods';
import { useUsageFormat } from './use-usage-format';

type Metric = 'costUsd' | 'requests' | 'totalTokens' | 'failed' | 'images' | 'texts' | 'audio' | 'video';
export function UsageDelta({ current, previous, field, available }: { current: UsageMeasures; previous: UsageMeasures; field: Metric; available: boolean }) {
  const language = useFormatLocale();
  const { usageMoney, usageNumber } = useUsageFormat();
  const tUi = useTranslations();
  const complete = available && (field === 'costUsd' ? !current.unknownCostRequests && !previous.unknownCostRequests
    : field === 'totalTokens' ? !current.unknownTokenRequests && !previous.unknownTokenRequests
      : field === 'failed' ? !current.unconfirmed && !previous.unconfirmed : true);
  const change = usageChange(current[field], previous[field], complete);
  const prior = field === 'costUsd' ? usageMoney(previous.costUsd) : usageNumber(previous[field]);
  if (change.kind !== 'percent') {
    const label = change.kind === 'new' ? tUi("Ранее 0") : change.kind === 'empty' ? tUi("Без изменений") : tUi("Нет сравнения");
    return <span className="usage-delta" title={change.kind === 'unknown' ? tUi("Недостаточно полных данных для сравнения.") : tUi("В предыдущем периоде было 0. Процент от нуля не рассчитывается.")}>{label}</span>;
  }
  const percent = Number(change.basisPoints) / 100;
  const direction = percent > 0 ? 1 : percent < 0 ? -1 : 0;
  const meaning = field === 'failed' ? -direction : ['images', 'texts', 'audio', 'video'].includes(field) ? direction : 0;
  const formatted = new Intl.NumberFormat(language, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(percent);
  return <span className={`usage-delta ${meaning > 0 ? 'usage-delta-positive' : meaning < 0 ? 'usage-delta-negative' : 'usage-delta-neutral'}`}
    title={tUi("Предыдущий период: {p1}. Изменение = (текущее − предыдущее) / предыдущее × 100%.", { p1: prior })}>
    {direction > 0 ? '↑ ' : direction < 0 ? '↓ ' : ''}{formatted}%
  </span>;
}
