import type { UsageMeasures } from '@/modules/usage/contracts/usage-dashboard';
import { usageChange } from '@/modules/usage/core/usage-periods';
import { usageMoney, usageNumber } from './usage-format';

type Metric = 'costUsd' | 'requests' | 'totalTokens' | 'failed' | 'images' | 'texts' | 'audio' | 'video';
export function UsageDelta({ current, previous, field, available }: { current: UsageMeasures; previous: UsageMeasures; field: Metric; available: boolean }) {
  const complete = available && (field === 'costUsd' ? !current.unknownCostRequests && !previous.unknownCostRequests
    : field === 'totalTokens' ? !current.unknownTokenRequests && !previous.unknownTokenRequests
      : field === 'failed' ? !current.unconfirmed && !previous.unconfirmed : true);
  const change = usageChange(current[field], previous[field], complete);
  const prior = field === 'costUsd' ? usageMoney(previous.costUsd) : usageNumber(previous[field]);
  if (change.kind !== 'percent') {
    const label = change.kind === 'new' ? 'Ранее 0' : change.kind === 'empty' ? 'Без изменений' : 'Нет сравнения';
    return <span className="usage-delta" title={change.kind === 'unknown' ? 'Недостаточно полных данных для сравнения.' : 'В предыдущем периоде было 0. Процент от нуля не рассчитывается.'}>{label}</span>;
  }
  const percent = Number(change.basisPoints) / 100;
  const direction = percent > 0 ? 1 : percent < 0 ? -1 : 0;
  const meaning = field === 'failed' ? -direction : ['images', 'texts', 'audio', 'video'].includes(field) ? direction : 0;
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(percent);
  return <span className={`usage-delta ${meaning > 0 ? 'usage-delta-positive' : meaning < 0 ? 'usage-delta-negative' : 'usage-delta-neutral'}`}
    title={`Предыдущий период: ${prior}. Изменение = (текущее − предыдущее) / предыдущее × 100%.`}>
    {direction > 0 ? '↑ ' : direction < 0 ? '↓ ' : ''}{formatted}%
  </span>;
}
