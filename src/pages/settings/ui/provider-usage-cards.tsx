import { Activity, CircleDollarSign } from 'lucide-react';
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
  const available = connection && connection.status !== 'disconnected';
  return (
    <section className="settings-card settings-usage-card" aria-labelledby="provider-usage-title">
      <div className="settings-card-head settings-card-head-split">
        <div className="settings-card-title">
          <span><CircleDollarSign size={18} /></span>
          <div>
            <h3 id="provider-usage-title">Лимиты OpenRouter key</h3>
            <p>Данные провайдера относятся к подключённому API key, а не ко всему аккаунту.</p>
          </div>
        </div>
        <small>{usage ? `Обновлено ${formatDateTime(usage.updatedAt)}` : 'Нет синхронизации'}</small>
      </div>
      {!available ? <p className="settings-empty">Подключите OpenRouter, чтобы увидеть лимиты key.</p> : null}
      {available && !usage ? <p className="settings-empty">OpenRouter пока не вернул сведения о лимитах.</p> : null}
      {usage ? (
        <>
          <div className="settings-provider-limit-grid">
            <UsageMetric label="Лимит key" value={formatUsd(usage.limit)} />
            <UsageMetric label="Осталось" value={formatUsd(usage.limitRemaining)} />
            <UsageMetric label="Использовано" value={formatUsd(usage.usage)} />
          </div>
          <div className="settings-provider-period-grid">
            <UsageMetric label="Сегодня" value={formatUsd(usage.usageDaily)} />
            <UsageMetric label="7 дней" value={formatUsd(usage.usageWeekly)} />
            <UsageMetric label="30 дней" value={formatUsd(usage.usageMonthly)} />
            <UsageMetric label="Всё время" value={formatUsd(usage.usageTotal)} />
          </div>
          <p className="settings-provider-usage-note">
            <span>{formatKeyTier(usage.isFreeTier)}</span>
            <span>{formatLimitReset(usage.limitReset)}</span>
            {usage.label ? <span>{usage.label}</span> : null}
          </p>
        </>
      ) : null}
    </section>
  );
}

export function LocalUsageCard({ usage }: { usage: WorkspaceAiUsage | null }) {
  return (
    <section className="settings-card settings-usage-card" aria-labelledby="local-usage-title">
      <div className="settings-card-head">
        <span><Activity size={18} /></span>
        <div>
          <h3 id="local-usage-title">Использование в Reverie</h3>
          <p>Локальный журнал выполненных AI-операций за последние 30 дней.</p>
        </div>
      </div>
      {!usage ? <p className="settings-empty">Статистика пока недоступна или ещё не накоплена.</p> : (
        <>
          <div className="settings-provider-period-grid">
            <UsageMetric label="Задачи" value={formatInteger(usage.summary.jobs)} />
            <UsageMetric label="Input tokens" value={formatInteger(usage.summary.inputTokens)} />
            <UsageMetric label="Output tokens" value={formatInteger(usage.summary.outputTokens)} />
            <UsageMetric label="Стоимость" value={formatUsd(usage.summary.providerCostUsd)} />
          </div>
          <div className="settings-usage-breakdowns">
            <UsageBreakdown title="По моделям" labelHeading="Модель" rows={usage.byModel.map((item) => ({
              id: item.modelId, label: item.modelId, jobs: item.jobs,
              totalTokens: item.totalTokens, providerCostUsd: item.providerCostUsd,
            }))} />
            <UsageBreakdown title="По операциям" labelHeading="Операция" rows={usage.byOperation.map((item) => ({
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
  return (
    <div className="settings-usage-table-wrap">
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="settings-empty">Данных пока нет.</p> : (
        <table className="settings-usage-table">
          <thead><tr><th>{labelHeading}</th><th>Задачи</th><th>Tokens</th><th>Стоимость</th></tr></thead>
          <tbody>{rows.map((item) => (
            <tr key={item.id}>
              <td title={item.label}>{item.label}</td>
              <td>{formatInteger(item.jobs)}</td>
              <td>{formatInteger(item.totalTokens)}</td>
              <td>{formatUsd(item.providerCostUsd)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
