'use client';

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
} from 'lucide-react';
import type { ProviderConnectionDto } from '../api/workspace-ai-api';
import type { ProviderSettingsModel } from '../model/use-provider-settings-model';
import { formatDateTime, roleLabel } from '../model/provider-settings-values';

export function ProviderConnectionCard({ model }: { model: ProviderSettingsModel }) {
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
            <p>Один API key используется всеми разрешёнными AI-операциями Workspace.</p>
          </div>
        </div>
        <span className="settings-provider-role">{roleLabel(effectiveWorkspace.role)}</span>
      </div>

      <dl className="settings-provider-details">
        <ProviderDetail
          label="Сохранённый key"
          value={connection?.maskedKey || (disconnected ? 'Не подключён' : 'Скрыт')}
        />
        <ProviderDetail label="Последняя проверка" value={formatDateTime(connection?.lastValidatedAt)} />
        <ProviderDetail label="Последнее использование" value={formatDateTime(connection?.lastUsedAt)} />
        <ProviderDetail label="Область действия" value={effectiveWorkspace.name} />
      </dl>

      {connection?.lastError ? (
        <p className="settings-message settings-message-error" role="alert">{connection.lastError}</p>
      ) : null}
      {actionError ? (
        <p className="settings-message settings-message-error" role="alert">{actionError}</p>
      ) : null}
      {notice ? <p className="settings-message settings-message-success" role="status">{notice}</p> : null}

      {!canManage ? (
        <div className="settings-provider-readonly">
          <ShieldCheck size={17} />
          <div>
            <strong>Режим просмотра</strong>
            <span>Подключать, заменять и отключать key могут только Owner и Admin.</span>
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
  const {
    apiKey, disconnected, mutation, replaceConfirmationOpen, showApiKey,
  } = model;
  return (
    <form className="settings-form settings-provider-key-form" onSubmit={model.submitCredential}>
      <label>
        <span>{disconnected ? 'OpenRouter API key' : 'Новый OpenRouter API key'}</span>
        <div className="settings-provider-secret">
          <input
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
          <button
            type="button"
            aria-label={showApiKey ? 'Скрыть API key' : 'Показать API key'}
            onClick={model.toggleApiKeyVisibility}
            disabled={mutation !== null}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <small id="openrouter-key-help">
          Key отправляется только при сохранении и больше никогда не возвращается в браузер.
        </small>
      </label>

      {replaceConfirmationOpen ? <ReplaceConfirmation model={model} /> : (
        <div className="settings-form-actions settings-provider-form-actions">
          {!disconnected ? (
            <button className="settings-quiet-button" type="button"
              onClick={model.resetCredentialDraft} disabled={mutation !== null}>
              Отмена
            </button>
          ) : null}
          <button className="settings-primary-button" type="submit"
            disabled={mutation !== null || !apiKey.trim()}>
            {mutation === 'connect' ? <Loader2 className="spin" size={15} /> : <PlugZap size={15} />}
            {disconnected ? 'Подключить OpenRouter' : 'Проверить новый key'}
          </button>
        </div>
      )}
    </form>
  );
}

function ReplaceConfirmation({ model }: { model: ProviderSettingsModel }) {
  return (
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
        <button className="settings-quiet-button" type="button"
          onClick={model.closeReplaceConfirmation} disabled={model.mutation !== null}>
          Отмена
        </button>
        <button className="settings-primary-button" type="button"
          onClick={() => void model.persistCredential(true)} disabled={model.mutation !== null}>
          {model.mutation === 'connect'
            ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
          Подтвердить замену
        </button>
      </div>
    </div>
  );
}

function ConnectionActions({ model }: { model: ProviderSettingsModel }) {
  return (
    <div className="settings-provider-actions">
      <button className="settings-primary-button" type="button"
        onClick={() => void model.validateConnection()} disabled={model.mutation !== null}>
        {model.mutation === 'validate'
          ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
        Проверить
      </button>
      <button className="settings-quiet-button" type="button"
        onClick={model.openReplaceForm} disabled={model.mutation !== null}>
        <KeyRound size={15} />
        Заменить key
      </button>
      <button className="settings-danger-button" type="button"
        onClick={model.openDisconnectConfirmation} disabled={model.mutation !== null}>
        <Unplug size={15} />
        Отключить
      </button>
    </div>
  );
}

function DisconnectConfirmation({ model }: { model: ProviderSettingsModel }) {
  return (
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
        <button className="settings-quiet-button" type="button"
          onClick={model.closeDisconnectConfirmation} disabled={model.mutation !== null}>
          Оставить подключение
        </button>
        <button className="settings-danger-button" type="button"
          onClick={() => void model.confirmDisconnect()} disabled={model.mutation !== null}>
          {model.mutation === 'disconnect'
            ? <Loader2 className="spin" size={15} /> : <Unplug size={15} />}
          Подтвердить отключение
        </button>
      </div>
    </div>
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
      {content.icon}{content.label}
    </span>
  );
}

function ProviderDetail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
