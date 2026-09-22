'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import type { useKeyBudget } from '@/features/provider-budget/model/use-key-budget';
import { useUsageFormat } from './use-usage-format';

export function UsageBalance({ resource }: { resource: ReturnType<typeof useKeyBudget> }) {
  const { usageMoney } = useUsageFormat();
  const tUi = useTranslations();
  const { data, loading, error } = resource;
  const budget = data?.status === 'connected' ? data.budget : null;
  const remaining = data?.status === 'disconnected' ? 0 : budget?.remaining;
  const note = error ? data ? tUi("Не обновлён · последние доступные данные") : tUi("Не удалось получить баланс")
    : data?.status === 'disconnected' ? tUi("Подключите AI, чтобы пополнить баланс")
    : !data ? tUi("Проверяем баланс…") : remaining === null ? tUi("Остаток лимита не задан") : tUi("Доступно сейчас · независимо от периода");
  return <div className="usage-card usage-metric usage-balance" data-empty={remaining === 0 && !error || undefined} aria-label={tUi("Текущий баланс")} aria-busy={loading}>
    <span>{tUi("Баланс")}</span><div className="usage-value"><strong>{remaining == null ? '—' : usageMoney(String(remaining))}</strong></div>
    {error || data?.status !== 'disconnected' ? <small role={error ? 'status' : undefined}>{note}</small> : null}
  </div>;
}
