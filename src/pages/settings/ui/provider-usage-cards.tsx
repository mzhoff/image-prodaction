'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';
import { Activity, CircleDollarSign } from '@prodactionpro/ui-core/icons';
import type {
  OpenRouterKeyUsage,
  ProviderConnectionDto,
  WorkspaceAiUsage,
} from '../api/workspace-ai-api';
import {
  formatDateTime,
  formatInteger,
  formatKeyTier,
  formatLimitReset,
  formatOperation,
  formatUsd,
} from '../model/provider-settings-values';

export function ProviderUsageCard({ connection, usage }: {
  connection: ProviderConnectionDto | null;
  usage: OpenRouterKeyUsage | null;
}) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const available = connection && connection.status !== 'disconnected';
  return (
    <section className="settings-card settings-usage-card" aria-labelledby="provider-usage-title">
      <div className="settings-card-head settings-card-head-split">
        <div className="settings-card-title">
          <span><CircleDollarSign size={18} /></span>
          <div>
            <h3 id="provider-usage-title">{tUi("Баланс AI")}</h3>
            <p>{tUi("Баланс подключённого ключа этого пространства.")}</p>
          </div>
        </div>
        <small>{usage ? tUi("Обновлено {p1}", { p1: tUi(formatDateTime(usage.updatedAt, language)) }) : tUi("Нет синхронизации")}</small>
      </div>
      {!available ? <p className="settings-empty">{tUi("Подключите AI, чтобы увидеть баланс.")}</p> : null}
      {available && !usage ? <p className="settings-empty">{tUi("OpenRouter пока не вернул сведения о лимитах.")}</p> : null}
      {usage ? (
        <>
          <div className="settings-provider-limit-grid">
            <UsageMetric label={tUi("Лимит")} value={tUi(formatUsd(usage.limit))} />
            <UsageMetric label={tUi("Осталось")} value={tUi(formatUsd(usage.limitRemaining))} />
            <UsageMetric label={tUi("Использовано")} value={tUi(formatUsd(usage.usage))} />
          </div>
          <div className="settings-provider-period-grid">
            <UsageMetric label={tUi("Сегодня")} value={tUi(formatUsd(usage.usageDaily))} />
            <UsageMetric label={tUi("7 дней")} value={tUi(formatUsd(usage.usageWeekly))} />
            <UsageMetric label={tUi("30 дней")} value={tUi(formatUsd(usage.usageMonthly))} />
            <UsageMetric label={tUi("Всё время")} value={tUi(formatUsd(usage.usageTotal))} />
          </div>
          <p className="settings-provider-usage-note">
            <span>{tUi(formatKeyTier(usage.isFreeTier))}</span>
            <span>{tUi(formatLimitReset(usage.limitReset, language))}</span>
            {usage.label ? <span>{usage.label}</span> : null}
          </p>
        </>
      ) : null}
    </section>
  );
}

export function LocalUsageCard({ usage }: { usage: WorkspaceAiUsage | null }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  return (
    <section className="settings-card settings-usage-card" aria-labelledby="local-usage-title">
      <div className="settings-card-head">
        <span><Activity size={18} /></span>
        <div>
          <h3 id="local-usage-title">{tUi("Использование в Reverie")}</h3>
          <p>{tUi("За последние 30 дней.")}</p>
        </div>
      </div>
      {!usage ? <p className="settings-empty">{tUi("Статистика пока недоступна или ещё не накоплена.")}</p> : (
        <>
          <div className="settings-provider-period-grid">
            <UsageMetric label={tUi("Задачи")} value={formatInteger(usage.summary.jobs, language)} />
            <UsageMetric label={tUi("Входящие токены")} value={formatInteger(usage.summary.inputTokens, language)} />
            <UsageMetric label={tUi("Исходящие токены")} value={formatInteger(usage.summary.outputTokens, language)} />
            <UsageMetric label={tUi("Стоимость")} value={tUi(formatUsd(usage.summary.providerCostUsd))} />
          </div>
          <div className="settings-usage-breakdowns">
            <UsageBreakdown title={tUi("По моделям")} labelHeading={tUi("Модель")} rows={usage.byModel.map((item) => ({
              id: item.modelId, label: item.modelId, jobs: item.jobs,
              totalTokens: item.totalTokens, providerCostUsd: item.providerCostUsd,
            }))} />
            <UsageBreakdown title={tUi("По операциям")} labelHeading={tUi("Операция")} rows={usage.byOperation.map((item) => ({
              id: item.operation, label: formatOperation(item.operation), jobs: item.jobs,
              totalTokens: item.totalTokens, providerCostUsd: item.providerCostUsd,
            }))} />
          </div>
        </>
      )}
    </section>
  );
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return <div className="settings-usage-metric"><span>{label}</span><strong>{value}</strong></div>;
}

interface UsageBreakdownRow {
  id: string;
  jobs: number;
  label: string;
  providerCostUsd: string;
  totalTokens: string;
}

function UsageBreakdown({ labelHeading, rows, title }: {
  labelHeading: string;
  rows: UsageBreakdownRow[];
  title: string;
}) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  return (
    <div className="settings-usage-table-wrap">
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="settings-empty">{tUi("Данных пока нет.")}</p> : (
        <table className="settings-usage-table">
          <thead><tr><th>{labelHeading}</th><th>{tUi("Задачи")}</th><th>Tokens</th><th>{tUi("Стоимость")}</th></tr></thead>
          <tbody>{rows.map((item) => (
            <tr key={item.id}>
              <td title={item.label}>{item.label}</td>
              <td>{formatInteger(item.jobs, language)}</td>
              <td>{formatInteger(item.totalTokens, language)}</td>
              <td>{tUi(formatUsd(item.providerCostUsd))}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
