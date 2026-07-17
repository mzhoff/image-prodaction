'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { BrandSelectOption } from '@/shared/ui/brand-select';
import {
  WorkspaceAiApiError,
  connectOpenRouter,
  disconnectOpenRouter,
  fetchOpenRouterUsage,
  fetchWorkspaceAiUsage,
  fetchWorkspaceProviders,
  fetchWorkspaceSettingsOptions,
  validateOpenRouter,
} from '../api/workspace-ai-api';
import type {
  OpenRouterKeyUsage,
  ProviderConnectionDto,
  WorkspaceAiUsage,
  WorkspaceSettingsOption,
  WorkspaceSettingsRole,
} from '../api/workspace-ai-api';

interface ProviderSettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

type ProviderMutation = 'connect' | 'disconnect' | 'validate' | null;

export function ProviderSettings({ onDirtyChange }: ProviderSettingsProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSettingsOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspacesPending, setWorkspacesPending] = useState(true);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSettingsOption | null>(null);
  const [connection, setConnection] = useState<ProviderConnectionDto | null>(null);
  const [keyUsage, setKeyUsage] = useState<OpenRouterKeyUsage | null>(null);
  const [aiUsage, setAiUsage] = useState<WorkspaceAiUsage | null>(null);
  const [detailsPending, setDetailsPending] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<ProviderMutation>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [replaceFormOpen, setReplaceFormOpen] = useState(false);
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
  const [disconnectConfirmationOpen, setDisconnectConfirmationOpen] = useState(false);
  const dirty = apiKey.trim().length > 0;

  const loadWorkspaces = useCallback(async (signal?: AbortSignal) => {
    setWorkspacesPending(true);
    setWorkspacesError(null);
    try {
      const nextWorkspaces = await fetchWorkspaceSettingsOptions(signal);
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId((current) => (
        nextWorkspaces.some((item) => item.id === current)
          ? current
          : nextWorkspaces[0]?.id ?? ''
      ));
    } catch (error) {
      if (isAbortError(error)) return;
      setWorkspaces([]);
      setSelectedWorkspaceId('');
      setWorkspacesError(readErrorMessage(error));
    } finally {
      if (!signal?.aborted) setWorkspacesPending(false);
    }
  }, []);

  const loadWorkspaceDetails = useCallback(async (
    workspaceId: string,
    signal?: AbortSignal,
  ) => {
    setDetailsPending(true);
    setDetailsError(null);
    setSecondaryError(null);
    try {
      const [providersResult, keyUsageResult, aiUsageResult] = await Promise.allSettled([
        fetchWorkspaceProviders(workspaceId, signal),
        fetchOpenRouterUsage(workspaceId, signal),
        fetchWorkspaceAiUsage(workspaceId, 30, signal),
      ]);
      if (signal?.aborted) return;
      if (providersResult.status === 'rejected') throw providersResult.reason;

      const nextConnection = providersResult.value.providers.find(
        (item) => item.provider === 'openrouter',
      ) ?? null;
      setWorkspace(providersResult.value.workspace);
      setConnection(nextConnection);
      setKeyUsage(keyUsageResult.status === 'fulfilled' ? keyUsageResult.value : null);
      setAiUsage(aiUsageResult.status === 'fulfilled' ? aiUsageResult.value : null);

      const partialErrors: string[] = [];
      if (
        keyUsageResult.status === 'rejected'
        && nextConnection
        && nextConnection.status !== 'disconnected'
        && !isNotFoundError(keyUsageResult.reason)
      ) {
        partialErrors.push('Не удалось обновить лимиты OpenRouter.');
      }
      if (aiUsageResult.status === 'rejected') {
        partialErrors.push('Не удалось загрузить локальную статистику Reverie.');
      }
      setSecondaryError(partialErrors.join(' '));
    } catch (error) {
      if (isAbortError(error)) return;
      setWorkspace(null);
      setConnection(null);
      setKeyUsage(null);
      setAiUsage(null);
      setDetailsError(readErrorMessage(error));
    } finally {
      if (!signal?.aborted) setDetailsPending(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspace(null);
      setConnection(null);
      setKeyUsage(null);
      setAiUsage(null);
      return;
    }
    const controller = new AbortController();
    void loadWorkspaceDetails(selectedWorkspaceId, controller.signal);
    return () => controller.abort();
  }, [loadWorkspaceDetails, selectedWorkspaceId]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const workspaceOptions = useMemo<BrandSelectOption[]>(() => workspaces.map((item) => ({
    value: item.id,
    label: item.name,
    description: roleLabel(item.role),
  })), [workspaces]);
  const effectiveWorkspace = workspace
    ?? workspaces.find((item) => item.id === selectedWorkspaceId)
    ?? null;
  const canManage = connection?.canManage
    ?? Boolean(effectiveWorkspace && ['owner', 'admin'].includes(effectiveWorkspace.role));
  const disconnected = !connection || connection.status === 'disconnected';
  const showCredentialForm = canManage && (disconnected || replaceFormOpen);

  function selectWorkspace(nextWorkspaceId: string) {
    if (!nextWorkspaceId || nextWorkspaceId === selectedWorkspaceId) return;
    if (
      dirty
      && !window.confirm('API key ещё не сохранён. Переключить Workspace и удалить введённое значение?')
    ) {
      return;
    }
    resetCredentialDraft();
    setActionError(null);
    setNotice(null);
    setSelectedWorkspaceId(nextWorkspaceId);
  }

  function resetCredentialDraft() {
    setApiKey('');
    setShowApiKey(false);
    setReplaceFormOpen(false);
    setReplaceConfirmationOpen(false);
    setDisconnectConfirmationOpen(false);
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setNotice(null);
    if (apiKey.trim().length < 12) {
      setActionError('Введите полный OpenRouter API key.');
      return;
    }
    if (!disconnected) {
      setReplaceConfirmationOpen(true);
      return;
    }
    await persistCredential(false);
  }

  async function persistCredential(replacing: boolean) {
    if (!selectedWorkspaceId || mutation) return;
    const secret = apiKey.trim();
    if (!secret) return;
    setMutation('connect');
    setActionError(null);
    setNotice(null);
    try {
      const result = await connectOpenRouter(selectedWorkspaceId, secret);
      setConnection(result.provider);
      resetCredentialDraft();
      setNotice(
        replacing
          ? 'Новый OpenRouter key проверен и заменил предыдущее подключение.'
          : 'OpenRouter подключён для всего Workspace.',
      );
      await loadWorkspaceDetails(selectedWorkspaceId);
    } catch (error) {
      const message = readErrorMessage(error);
      await loadWorkspaceDetails(selectedWorkspaceId);
      setActionError(message);
    } finally {
      setMutation(null);
    }
  }

  async function validateConnection() {
    if (!selectedWorkspaceId || mutation) return;
    setMutation('validate');
    setActionError(null);
    setNotice(null);
    try {
      const result = await validateOpenRouter(selectedWorkspaceId);
      setConnection(result.provider);
      setKeyUsage(result.keyUsage);
      if (result.valid) {
        setNotice('Подключение работает. Лимиты OpenRouter обновлены.');
      } else {
        setActionError(
          result.provider.lastError
          || 'OpenRouter отклонил сохранённый key. Замените его и повторите проверку.',
        );
      }
    } catch (error) {
      const message = readErrorMessage(error);
      await loadWorkspaceDetails(selectedWorkspaceId);
      setActionError(message);
    } finally {
      setMutation(null);
    }
  }

  async function confirmDisconnect() {
    if (!selectedWorkspaceId || mutation) return;
    setMutation('disconnect');
    setActionError(null);
    setNotice(null);
    try {
      await disconnectOpenRouter(selectedWorkspaceId);
      setConnection({
        provider: 'openrouter',
        status: 'disconnected',
        canManage,
        maskedKey: null,
        lastValidatedAt: null,
        lastUsedAt: null,
        lastError: null,
      });
      setKeyUsage(null);
      setDisconnectConfirmationOpen(false);
      resetCredentialDraft();
      setNotice('OpenRouter отключён. Новые AI-операции этого Workspace запускаться не будут.');
      await loadWorkspaceDetails(selectedWorkspaceId);
    } catch (error) {
      setActionError(readErrorMessage(error));
    } finally {
      setMutation(null);
    }
  }

  return (
    <section className="settings-section settings-provider-section" aria-labelledby="settings-providers-title">
      <header className="settings-section-head settings-provider-title-row">
        <div>
          <h2 id="settings-providers-title">AI Providers</h2>
          <p>Подключение и расходы AI-провайдеров на уровне Workspace.</p>
        </div>
        {workspaceOptions.length > 0 ? (
          <BrandSelect
            className="settings-workspace-select"
            disabled={workspacesPending || mutation !== null}
            label="Workspace"
            value={selectedWorkspaceId}
            options={workspaceOptions}
            onChange={selectWorkspace}
          />
        ) : null}
      </header>

      {workspacesPending ? (
        <SettingsState busy icon={<Loader2 className="spin" size={22} />} title="Загружаем Workspace">
          Проверяем доступные рабочие пространства.
        </SettingsState>
      ) : null}

      {!workspacesPending && workspacesError ? (
        <SettingsState icon={<AlertCircle size={22} />} title="Workspace недоступны" tone="error">
          <span>{workspacesError}</span>
          <button type="button" onClick={() => void loadWorkspaces()}>
            <RefreshCcw size={14} />
            Повторить
          </button>
        </SettingsState>
      ) : null}

      {!workspacesPending && !workspacesError && workspaces.length === 0 ? (
        <SettingsState icon={<PlugZap size={22} />} title="Нет доступных Workspace">
          Сначала создайте или получите доступ к рабочему пространству.
        </SettingsState>
      ) : null}

      {detailsPending && selectedWorkspaceId ? <ProviderSettingsSkeleton /> : null}

      {!detailsPending && detailsError ? (
        <SettingsState icon={<AlertCircle size={22} />} title="Настройки провайдера недоступны" tone="error">
          <span>{detailsError}</span>
          <button type="button" onClick={() => void loadWorkspaceDetails(selectedWorkspaceId)}>
            <RefreshCcw size={14} />
            Повторить
          </button>
        </SettingsState>
      ) : null}

      {!detailsPending && !detailsError && effectiveWorkspace ? (
        <div className="settings-provider-stack">
          <section className="settings-card settings-provider-card" aria-labelledby="openrouter-card-title">
            <div className="settings-provider-card-head">
              <div className="settings-provider-identity">
                <span className="settings-provider-logo" aria-hidden="true">OR</span>
                <div>
                  <div className="settings-provider-heading">
                    <h3 id="openrouter-card-title">OpenRouter</h3>
                    <ConnectionStatus status={connection?.status ?? 'disconnected'} />
                  </div>
                  <p>Один API key используется всеми разрешёнными AI-операциями Workspace.</p>
                </div>
              </div>
              <span className="settings-provider-role">
                {roleLabel(effectiveWorkspace.role)}
              </span>
            </div>

            <dl className="settings-provider-details">
              <ProviderDetail
                label="Сохранённый key"
                value={connection?.maskedKey || (disconnected ? 'Не подключён' : 'Скрыт')}
              />
              <ProviderDetail
                label="Последняя проверка"
                value={formatDateTime(connection?.lastValidatedAt)}
              />
              <ProviderDetail
                label="Последнее использование"
                value={formatDateTime(connection?.lastUsedAt)}
              />
              <ProviderDetail label="Область действия" value={effectiveWorkspace.name} />
            </dl>

            {connection?.lastError ? (
              <p className="settings-message settings-message-error" role="alert">
                {connection.lastError}
              </p>
            ) : null}
            {actionError ? (
              <p className="settings-message settings-message-error" role="alert">{actionError}</p>
            ) : null}
            {notice ? (
              <p className="settings-message settings-message-success" role="status">{notice}</p>
            ) : null}

            {!canManage ? (
              <div className="settings-provider-readonly">
                <ShieldCheck size={17} />
                <div>
                  <strong>Режим просмотра</strong>
                  <span>Подключать, заменять и отключать key могут только Owner и Admin.</span>
                </div>
              </div>
            ) : null}

            {showCredentialForm ? (
              <form className="settings-form settings-provider-key-form" onSubmit={submitCredential}>
                <label>
                  <span>{disconnected ? 'OpenRouter API key' : 'Новый OpenRouter API key'}</span>
                  <div className="settings-provider-secret">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      name="openrouter-api-key"
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setActionError(null);
                        setReplaceConfirmationOpen(false);
                      }}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={mutation !== null}
                      placeholder="sk-or-v1-…"
                      aria-describedby="openrouter-key-help"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showApiKey ? 'Скрыть API key' : 'Показать API key'}
                      onClick={() => setShowApiKey((visible) => !visible)}
                      disabled={mutation !== null}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <small id="openrouter-key-help">
                    Key отправляется только при сохранении и больше никогда не возвращается в браузер.
                  </small>
                </label>

                {replaceConfirmationOpen ? (
                  <div className="settings-provider-confirmation" role="alert">
                    <AlertCircle size={18} />
                    <div>
                      <strong>Заменить действующий key?</strong>
                      <span>
                        Новый key сначала проверится. Старое подключение останется рабочим,
                        если проверка завершится ошибкой.
                      </span>
                    </div>
                    <div>
                      <button
                        className="settings-quiet-button"
                        type="button"
                        onClick={() => setReplaceConfirmationOpen(false)}
                        disabled={mutation !== null}
                      >
                        Отмена
                      </button>
                      <button
                        className="settings-primary-button"
                        type="button"
                        onClick={() => void persistCredential(true)}
                        disabled={mutation !== null}
                      >
                        {mutation === 'connect' ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
                        Подтвердить замену
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="settings-form-actions settings-provider-form-actions">
                    {!disconnected ? (
                      <button
                        className="settings-quiet-button"
                        type="button"
                        onClick={resetCredentialDraft}
                        disabled={mutation !== null}
                      >
                        Отмена
                      </button>
                    ) : null}
                    <button
                      className="settings-primary-button"
                      type="submit"
                      disabled={mutation !== null || !apiKey.trim()}
                    >
                      {mutation === 'connect' ? <Loader2 className="spin" size={15} /> : <PlugZap size={15} />}
                      {disconnected ? 'Подключить OpenRouter' : 'Проверить новый key'}
                    </button>
                  </div>
                )}
              </form>
            ) : null}

            {canManage && !disconnected && !showCredentialForm ? (
              <div className="settings-provider-actions">
                <button
                  className="settings-primary-button"
                  type="button"
                  onClick={() => void validateConnection()}
                  disabled={mutation !== null}
                >
                  {mutation === 'validate' ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                  Проверить
                </button>
                <button
                  className="settings-quiet-button"
                  type="button"
                  onClick={() => {
                    setReplaceFormOpen(true);
                    setActionError(null);
                    setNotice(null);
                  }}
                  disabled={mutation !== null}
                >
                  <KeyRound size={15} />
                  Заменить key
                </button>
                <button
                  className="settings-danger-button"
                  type="button"
                  onClick={() => setDisconnectConfirmationOpen(true)}
                  disabled={mutation !== null}
                >
                  <Unplug size={15} />
                  Отключить
                </button>
              </div>
            ) : null}

            {disconnectConfirmationOpen ? (
              <div className="settings-provider-confirmation settings-provider-confirmation-danger" role="alert">
                <AlertCircle size={18} />
                <div>
                  <strong>Отключить OpenRouter?</strong>
                  <span>
                    Новые AI-задачи остановятся. Уже поставленные в очередь операции могут
                    завершиться ошибкой, если ещё не получили credential.
                  </span>
                </div>
                <div>
                  <button
                    className="settings-quiet-button"
                    type="button"
                    onClick={() => setDisconnectConfirmationOpen(false)}
                    disabled={mutation !== null}
                  >
                    Оставить подключение
                  </button>
                  <button
                    className="settings-danger-button"
                    type="button"
                    onClick={() => void confirmDisconnect()}
                    disabled={mutation !== null}
                  >
                    {mutation === 'disconnect'
                      ? <Loader2 className="spin" size={15} />
                      : <Unplug size={15} />}
                    Подтвердить отключение
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <ProviderUsageCard connection={connection} usage={keyUsage} />
          <LocalUsageCard usage={aiUsage} />

          {secondaryError ? (
            <p className="settings-message settings-message-error" role="alert">
              {secondaryError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ConnectionStatus({ status }: { status: ProviderConnectionDto['status'] }) {
  const content = {
    connected: { label: 'Подключён', icon: <CheckCircle2 size={13} /> },
    invalid: { label: 'Требует внимания', icon: <AlertCircle size={13} /> },
    disconnected: { label: 'Не подключён', icon: <Unplug size={13} /> },
  }[status];
  return (
    <span className={`settings-provider-status settings-provider-status-${status}`}>
      {content.icon}
      {content.label}
    </span>
  );
}

function ProviderDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProviderUsageCard({
  connection,
  usage,
}: {
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

      {!available ? (
        <p className="settings-empty">Подключите OpenRouter, чтобы увидеть лимиты key.</p>
      ) : null}
      {available && !usage ? (
        <p className="settings-empty">OpenRouter пока не вернул сведения о лимитах.</p>
      ) : null}
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

function LocalUsageCard({ usage }: { usage: WorkspaceAiUsage | null }) {
  return (
    <section className="settings-card settings-usage-card" aria-labelledby="local-usage-title">
      <div className="settings-card-head">
        <span><Activity size={18} /></span>
        <div>
          <h3 id="local-usage-title">Использование в Reverie</h3>
          <p>Локальный журнал выполненных AI-операций за последние 30 дней.</p>
        </div>
      </div>

      {!usage ? (
        <p className="settings-empty">Статистика пока недоступна или ещё не накоплена.</p>
      ) : (
        <>
          <div className="settings-provider-period-grid">
            <UsageMetric label="Задачи" value={formatInteger(usage.summary.jobs)} />
            <UsageMetric label="Input tokens" value={formatInteger(usage.summary.inputTokens)} />
            <UsageMetric label="Output tokens" value={formatInteger(usage.summary.outputTokens)} />
            <UsageMetric label="Стоимость" value={formatUsd(usage.summary.providerCostUsd)} />
          </div>
          <div className="settings-usage-breakdowns">
            <UsageBreakdown
              title="По моделям"
              labelHeading="Модель"
              rows={usage.byModel.map((item) => ({
                id: item.modelId,
                label: item.modelId,
                jobs: item.jobs,
                totalTokens: item.totalTokens,
                providerCostUsd: item.providerCostUsd,
              }))}
            />
            <UsageBreakdown
              title="По операциям"
              labelHeading="Операция"
              rows={usage.byOperation.map((item) => ({
                id: item.operation,
                label: formatOperation(item.operation),
                jobs: item.jobs,
                totalTokens: item.totalTokens,
                providerCostUsd: item.providerCostUsd,
              }))}
            />
          </div>
        </>
      )}
    </section>
  );
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-usage-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface UsageBreakdownRow {
  id: string;
  jobs: number;
  label: string;
  providerCostUsd: string;
  totalTokens: string;
}

function UsageBreakdown({
  labelHeading,
  rows,
  title,
}: {
  labelHeading: string;
  rows: UsageBreakdownRow[];
  title: string;
}) {
  return (
    <div className="settings-usage-table-wrap">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="settings-empty">Данных пока нет.</p>
      ) : (
        <table className="settings-usage-table">
          <thead>
            <tr>
              <th>{labelHeading}</th>
              <th>Задачи</th>
              <th>Tokens</th>
              <th>Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td title={item.label}>{item.label}</td>
                <td>{formatInteger(item.jobs)}</td>
                <td>{formatInteger(item.totalTokens)}</td>
                <td>{formatUsd(item.providerCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SettingsState({
  busy = false,
  children,
  icon,
  title,
  tone = 'neutral',
}: {
  busy?: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  tone?: 'error' | 'neutral';
}) {
  return (
    <div
      className={`settings-provider-state settings-provider-state-${tone}`}
      aria-busy={busy || undefined}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{icon}</span>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function ProviderSettingsSkeleton() {
  return (
    <div className="settings-provider-skeleton" aria-label="Загружаем настройки AI Providers" aria-busy="true">
      <i />
      <i />
      <i />
    </div>
  );
}

function roleLabel(role: WorkspaceSettingsRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Только просмотр';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatUsd(value: number | string | null) {
  if (value === null || value === '') return 'Не предоставлено';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Не предоставлено';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(parsed);
}

function formatInteger(value: number | string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(parsed);
}

function formatOperation(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/^\w/u, (letter) => letter.toUpperCase());
}

function formatKeyTier(value?: boolean | null) {
  if (value === true) return 'Free tier key';
  if (value === false) return 'Paid key';
  return 'Тариф key не предоставлен';
}

function formatLimitReset(value?: string | null) {
  if (!value) return 'Reset policy не предоставлена';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return `Reset: ${value}`;
  return `Reset: ${formatDateTime(value)}`;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isNotFoundError(error: unknown) {
  return error instanceof WorkspaceAiApiError && error.status === 404;
}
