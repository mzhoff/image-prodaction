'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { useEffect, useState, type FormEvent } from 'react';
import type { RuntimeV2Credential } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { readableRuntimeDate } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import styles from './runtime-connections.module.css';

export function RuntimeCredentials({ model }: { model: RuntimeConnectionsModel }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const [label, setLabel] = useState(tUi("Основной ключ"));
  const [expires, setExpires] = useState('');
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setCheckedAt(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const credentials = model.details?.credentials ?? [];
  const activeCount = credentials.filter((credential) => !credential.revokedAt
    && (!credential.expiresAt || Date.parse(credential.expiresAt) > checkedAt)).length;
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (model.issuedCredential) return;
    const result = await model.mutate(() => runtimeConnectionsApi.issueCredential(model.workspaceId, model.clientId, {
      label: label.trim(), scopes: null, expiresAt: expires ? new Date(expires).toISOString() : null,
    }), tUi("Ключ создан. Он показан один раз. Существующие ключи продолжают работать до явного отзыва."));
    if (!result) return;
    model.setIssuedCredential(result);
    setVisible(false);
    setCopied(false);
    setCopyError(false);
    await model.refresh();
  }
  async function revoke(credential: RuntimeV2Credential) {
    if (!window.confirm(tUi("Отозвать ключ «{p1}»? Приложение с этим ключом потеряет доступ. Убедитесь, что новый ключ уже подключён.", { p1: credential.label }))) return;
    const revoked = await model.mutate(async () => {
      await runtimeConnectionsApi.revokeCredential(model.workspaceId, model.clientId, credential.id);
      return true;
    }, tUi("Ключ отозван. Другие ключи подключения продолжают работать."));
    if (revoked && model.issuedCredential?.credential.id === credential.id) model.setIssuedCredential(null);
    await model.refresh();
  }
  async function copy() {
    if (!model.issuedCredential) return;
    try {
      await navigator.clipboard.writeText(model.issuedCredential.token);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <article className="settings-card">
      <header><h3>{tUi("Ключи доступа")}</h3><p className={styles.muted}>{tUi("Для обновления ключа создайте второй, замените его в приложении, проверьте подключение и затем отзовите старый.")}</p></header>
      {model.issuedCredential ? (
        <div className={styles.secret} role="region" aria-label={tUi("Новый ключ показан один раз")}>
          <strong>{tUi("Сохраните ключ сейчас")}</strong>
          <p>{tUi("После закрытия его нельзя будет посмотреть снова. Перенесите ключ в серверные настройки приложения.")}</p>
          <label>{tUi("Новый ключ")}<input autoComplete="off" spellCheck={false} readOnly
            type={visible ? 'text' : 'password'} value={model.issuedCredential.token} /></label>
          <div className={styles.actions}>
            <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" onClick={() => setVisible((current) => !current)}>{visible ? tUi("Скрыть") : tUi("Показать")}</Button>
            <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="button" onClick={() => void copy()}>{copied ? tUi("Скопирован") : tUi("Скопировать")}</Button>
            <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" onClick={() => {
              if (window.confirm(tUi("Ключ уже сохранён в подключаемом приложении? После закрытия его нельзя будет показать снова."))) model.setIssuedCredential(null);
            }}>{tUi("Ключ сохранён, закрыть")}</Button>
          </div>
          {copyError ? <p role="alert">{tUi("Копирование недоступно. Нажмите «Показать» и скопируйте ключ из поля.")}</p> : null}
        </div>
      ) : null}
      {credentials.length === 0 ? <p className={styles.muted}>{tUi("Ключи ещё не выпущены.")}</p> : null}
      <ul className={styles.list}>
        {credentials.map((credential) => (
          <li key={credential.id} className={styles.listItem}>
            <div className={styles.cardHeader}><div><strong>{credential.label}</strong>
              <p className={styles.muted}>{credential.revokedAt ? tUi("Отозван") : credential.expiresAt && Date.parse(credential.expiresAt) <= checkedAt ? tUi("Срок истёк") : tUi("Активен")}</p>
              <p className={styles.muted}>{tUi("Последнее использование:")}{' '} {tUi(readableRuntimeDate(credential.lastUsedAt, language))}</p></div>
              {model.canManage && !credential.revokedAt ? <Button size="sm" intent="danger" appearance="soft" className="settings-danger-button" type="button" disabled={model.mutation}
                onClick={() => void revoke(credential)}>{tUi("Отозвать")}</Button> : null}</div>
            <details className={styles.diagnostics}><summary>{tUi("Сведения о ключе")}</summary>
              <dl><dt>ID</dt><dd>{credential.id}</dd><dt>{tUi("Префикс")}</dt><dd>{credential.tokenPrefix}</dd>
                <dt>{tUi("Создан")}</dt><dd>{tUi(readableRuntimeDate(credential.createdAt, language))}</dd><dt>{tUi("Действует до")}</dt><dd>{credential.expiresAt ? tUi(readableRuntimeDate(credential.expiresAt, language)) : tUi("Без срока")}</dd></dl>
            </details>
          </li>
        ))}
      </ul>
      {model.canManage && model.details?.client.enabled && !model.issuedCredential ? (
        <form className="settings-form" onSubmit={(event) => void issue(event)}>
          <label><span>{tUi("Название нового ключа")}</span><PuiInput required maxLength={120} value={label} disabled={model.mutation || activeCount >= 2}
            onChange={(event) => setLabel(event.target.value)} /></label>
          <label><span>{tUi("Срок действия (необязательно)")}</span><PuiInput type="datetime-local" value={expires} disabled={model.mutation || activeCount >= 2}
            onChange={(event) => setExpires(event.target.value)} /></label>
          {activeCount >= 2 ? <p className={styles.muted}>{tUi("Два ключа уже активны. После проверки нового подключения отзовите старый.")}</p> : null}
          <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit" disabled={model.mutation || activeCount >= 2}>
            {model.mutation ? tUi("Выпускаем…") : activeCount ? tUi("Выпустить ключ для замены") : tUi("Выпустить ключ")}
          </Button>
        </form>
      ) : null}
    </article>
  );
}
