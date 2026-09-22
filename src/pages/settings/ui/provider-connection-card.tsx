'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Unplug,
} from '@prodactionpro/ui-core/icons';
import type { ProviderConnectionDto } from '../api/workspace-ai-api';
import type { ProviderSettingsModel } from '../model/use-provider-settings-model';
import { formatDateTime, roleLabel } from '../model/provider-settings-values';

export function ProviderConnectionCard({ model }: { model: ProviderSettingsModel }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const {
    actionError, canManage, connection, disconnectConfirmationOpen, disconnected,
    effectiveWorkspace, notice, showCredentialForm,
  } = model;
  if (!effectiveWorkspace) return null;

  return (
    <section className="settings-card settings-provider-card" aria-labelledby="openrouter-card-title">
      <div className="settings-provider-card-head">
        <div className="settings-provider-identity">
          <span className="settings-provider-logo" aria-hidden="true">OR</span>
          <div>
            <div className="settings-provider-heading">
              <h3 id="openrouter-card-title">OpenRouter</h3>
              <ConnectionStatus status={connection?.status ?? 'disconnected'} />
            </div>
            <p>{tUi("Общий доступ к AI для этого пространства.")}</p>
          </div>
        </div>
        <span className="settings-provider-role">{tUi(roleLabel(effectiveWorkspace.role))}</span>
      </div>

      <details className="settings-details"><summary>{tUi("Сведения о подключении")}</summary><dl className="settings-provider-details">
        <ProviderDetail
          label={tUi("API-ключ")}
          value={connection?.maskedKey || (disconnected ? tUi("Не подключён") : tUi("Скрыт"))}
        />
        <ProviderDetail label={tUi("Последняя проверка")} value={tUi(formatDateTime(connection?.lastValidatedAt, language))} />
        <ProviderDetail label={tUi("Последнее использование")} value={tUi(formatDateTime(connection?.lastUsedAt, language))} />
        <ProviderDetail label={tUi("Область действия")} value={effectiveWorkspace.name} />
      </dl></details>

      {connection?.lastError ? (
        <p className="settings-message settings-message-error" role="alert">{typeof (connection.lastError) === 'string' ? tUi((connection.lastError) as string) : (connection.lastError)}</p>
      ) : null}
      {actionError ? (
        <p className="settings-message settings-message-error" role="alert">{typeof (actionError) === 'string' ? tUi((actionError) as string) : (actionError)}</p>
      ) : null}
      {notice ? <p className="settings-message settings-message-success" role="status">{typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}</p> : null}

      {!canManage ? (
        <div className="settings-provider-readonly">
          <ShieldCheck size={17} />
          <div>
            <strong>{connection?.managedByPlatform ? tUi("AI-бюджет REVERIE") : tUi("Режим просмотра")}</strong>
            <span>{connection?.managedByPlatform ? tUi("Подключение настроено автоматически. Для пополнения обратитесь к оператору.") : tUi("Изменять подключение могут владелец и администраторы.")}</span>
          </div>
        </div>
      ) : null}

      {showCredentialForm ? <CredentialForm model={model} /> : null}
      {canManage && !disconnected && !showCredentialForm ? <ConnectionActions model={model} /> : null}
      {disconnectConfirmationOpen ? <DisconnectConfirmation model={model} /> : null}
    </section>
  );
}

function CredentialForm({ model }: { model: ProviderSettingsModel }) {
  const tUi = useTranslations();
  const {
    apiKey, disconnected, mutation, replaceConfirmationOpen, showApiKey,
  } = model;
  return (
    <form className="settings-form settings-provider-key-form" onSubmit={model.submitCredential}>
      <label>
        <span>{disconnected ? tUi("OpenRouter API-ключ") : tUi("Новый OpenRouter API-ключ")}</span>
        <div className="settings-provider-secret">
          <PuiInput
            type={showApiKey ? 'text' : 'password'}
            name="openrouter-api-key"
            value={apiKey}
            onChange={(event) => model.updateApiKey(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={mutation !== null}
            placeholder="sk-or-v1-…"
            aria-describedby="openrouter-key-help"
            required
          />
          <Button size="sm" intent="neutral" appearance="soft"
            type="button"
            aria-label={showApiKey ? tUi("Скрыть API-ключ") : tUi("Показать API-ключ")}
            onClick={model.toggleApiKeyVisibility}
            disabled={mutation !== null}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
        <small id="openrouter-key-help">
          {tUi("После сохранения ключ будет скрыт.")}</small>
      </label>

      {replaceConfirmationOpen ? <ReplaceConfirmation model={model} /> : (
        <div className="settings-form-actions settings-provider-form-actions">
          {!disconnected ? (
            <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button"
              onClick={model.resetCredentialDraft} disabled={mutation !== null}>
              {tUi("Отмена")}</Button>
          ) : null}
          <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit"
            disabled={mutation !== null || !apiKey.trim()}>
            {mutation === 'connect' ? <Loader2 className="spin" size={15} /> : <PlugZap size={15} />}
            {disconnected ? tUi("Подключить OpenRouter") : tUi("Проверить новый ключ")}
          </Button>
        </div>
      )}
    </form>
  );
}

function ReplaceConfirmation({ model }: { model: ProviderSettingsModel }) {
  const tUi = useTranslations();
  return (
    <div className="settings-provider-confirmation" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>{tUi("Заменить действующий ключ?")}</strong>
        <span>
          {tUi("Новый ключ сначала проверится. Старое подключение останется рабочим, если проверка завершится ошибкой.")}</span>
      </div>
      <div>
        <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button"
          onClick={model.closeReplaceConfirmation} disabled={model.mutation !== null}>
          {tUi("Отмена")}</Button>
        <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="button"
          onClick={() => void model.persistCredential(true)} disabled={model.mutation !== null}>
          {model.mutation === 'connect'
            ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
          {tUi("Подтвердить замену")}</Button>
      </div>
    </div>
  );
}

function ConnectionActions({ model }: { model: ProviderSettingsModel }) {
  const tUi = useTranslations();
  return (
    <div className="settings-provider-actions">
      <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="button"
        onClick={() => void model.validateConnection()} disabled={model.mutation !== null}>
        {model.mutation === 'validate'
          ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
        {tUi("Проверить")}</Button>
      <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button"
        onClick={model.openReplaceForm} disabled={model.mutation !== null}>
        <KeyRound size={15} />
        {tUi("Заменить ключ")}</Button>
      <Button size="sm" intent="danger" appearance="soft" className="settings-danger-button" type="button"
        onClick={model.openDisconnectConfirmation} disabled={model.mutation !== null}>
        <Unplug size={15} />
        {tUi("Отключить")}</Button>
    </div>
  );
}

function DisconnectConfirmation({ model }: { model: ProviderSettingsModel }) {
  const tUi = useTranslations();
  return (
    <div className="settings-provider-confirmation settings-provider-confirmation-danger" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>{tUi("Отключить OpenRouter?")}</strong>
        <span>
          {tUi("Новые генерации станут недоступны. Задачи в очереди могут завершиться ошибкой.")}</span>
      </div>
      <div>
        <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button"
          onClick={model.closeDisconnectConfirmation} disabled={model.mutation !== null}>
          {tUi("Оставить подключение")}</Button>
        <Button size="sm" intent="danger" appearance="soft" className="settings-danger-button" type="button"
          onClick={() => void model.confirmDisconnect()} disabled={model.mutation !== null}>
          {model.mutation === 'disconnect'
            ? <Loader2 className="spin" size={15} /> : <Unplug size={15} />}
          {tUi("Подтвердить отключение")}</Button>
      </div>
    </div>
  );
}

function ConnectionStatus({ status }: { status: ProviderConnectionDto['status'] }) {
  const tUi = useTranslations();
  const content = {
    connected: { label: tUi("Подключён"), icon: <CheckCircle2 size={13} /> },
    invalid: { label: tUi("Требует внимания"), icon: <AlertCircle size={13} /> },
    disconnected: { label: tUi("Не подключён"), icon: <Unplug size={13} /> },
  }[status];
  return (
    <span className={`settings-provider-status settings-provider-status-${status}`}>
      {content.icon}{content.label}
    </span>
  );
}

function ProviderDetail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
