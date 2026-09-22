'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Switch } from '@prodactionpro/ui-core/client';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from '@prodactionpro/ui-core/icons';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, useSession } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';
import {
  formatDevice,
  formatPasswordChangeError,
  formatSessionDate,
  isMobileUserAgent,
  type SessionInfo,
} from '../model/security-session-values';

interface SecuritySettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

export function SecuritySettings({ onDirtyChange }: SecuritySettingsProps) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const { data: currentSession } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsPending, setSessionsPending] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const dirty = Boolean(currentPassword || newPassword || confirmation);

  const loadSessions = useCallback(async () => {
    setSessionsPending(true);
    setSessionError(null);
    try {
      const result = await authClient.listSessions();
      if (result.error) {
        setSessionError(tUi("Не удалось загрузить активные сессии."));
        return;
      }
      setSessions((result.data ?? []) as SessionInfo[]);
    } catch {
      setSessionError(tUi("Не удалось загрузить активные сессии."));
    } finally {
      setSessionsPending(false);
    }
  }, [tUi]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError(tUi("Новый пароль и подтверждение не совпадают."));
      return;
    }
    if (newPassword === currentPassword) {
      setError(tUi("Новый пароль должен отличаться от текущего."));
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });
      if (result.error) {
        setError(formatPasswordChangeError(result.error));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setMessage(
        revokeOtherSessions
          ? tUi("Пароль изменён. Остальные сессии завершены.")
          : tUi("Пароль успешно изменён."),
      );
      await loadSessions();
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  async function revokeSession(token: string) {
    setSessionError(null);
    try {
      const result = await authClient.revokeSession({ token });
      if (result.error) {
        setSessionError(tUi("Не удалось завершить выбранную сессию."));
        return;
      }
      setSessions((items) => items.filter((item) => item.token !== token));
    } catch {
      setSessionError(tUi("Не удалось завершить выбранную сессию."));
    }
  }

  async function revokeAllOtherSessions() {
    setSessionError(null);
    try {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        setSessionError(tUi("Не удалось завершить остальные сессии."));
        return;
      }
      await loadSessions();
    } catch {
      setSessionError(tUi("Не удалось завершить остальные сессии."));
    }
  }

  const currentToken = currentSession?.session.token;

  return (
    <section className="settings-section" aria-labelledby="settings-security-title">
      <header className="settings-section-head">
        <div>
          <h2 id="settings-security-title">{tUi("Безопасность")}</h2>
        </div>
      </header>

      <div className="settings-card">
        <div className="settings-card-head">
          <span><KeyRound size={18} /></span>
          <div>
            <h3>{tUi("Сменить пароль")}</h3>
          </div>
        </div>
        <form className="settings-form" onSubmit={changePassword}>
          <label>
            <span>{tUi("Текущий пароль")}</span>
            <PuiInput
              type="password"
              name="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              disabled={pending}
              required
            />
          </label>
          <div className="settings-form-row">
            <label>
              <span>{tUi("Новый пароль")}</span>
              <PuiInput
                type="password"
                name="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                disabled={pending}
                required
              />
            </label>
            <label>
              <span>{tUi("Повторите пароль")}</span>
              <PuiInput
                type="password"
                name="password-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                disabled={pending}
                required
              />
            </label>
          </div>
          <label className="settings-checkbox">
            <Switch aria-label={tUi("Выйти на остальных устройствах")} checked={revokeOtherSessions}
              onCheckedChange={setRevokeOtherSessions} disabled={pending} size="sm" />
            <span>
              <strong>{tUi("Выйти на остальных устройствах")}</strong>
              <small>{tUi("Текущая сессия останется активной.")}</small>
            </span>
          </label>
          {error ? <p className="settings-message settings-message-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
          {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}
          <div className="settings-form-actions">
            <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit" disabled={pending || !dirty}>
              <ShieldCheck size={16} />
              {pending ? tUi("Меняем…") : tUi("Сменить пароль")}
            </Button>
          </div>
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card-head settings-card-head-split">
          <div className="settings-card-title">
            <span><Laptop size={18} /></span>
            <div>
              <h3>{tUi("Устройства")}</h3>
            </div>
          </div>
          <Button size="sm" intent="neutral" appearance="soft"
            className="settings-quiet-button"
            type="button"
            onClick={() => void revokeAllOtherSessions()}
            disabled={sessionsPending || sessions.length <= 1}
          >
            {tUi("Завершить остальные")}</Button>
        </div>

        {sessionsPending ? <p className="settings-empty">{tUi("Загружаем сессии…")}</p> : null}
        {!sessionsPending && sessions.length === 0 ? (
          <p className="settings-empty">{tUi("Активные сессии не найдены.")}</p>
        ) : null}
        <div className="settings-session-list">
          {sessions.map((item) => {
            const isCurrent = item.token === currentToken;
            return (
              <article className="settings-session" key={item.id}>
                <span className="settings-session-icon" aria-hidden="true">
                  {isMobileUserAgent(item.userAgent) ? <Smartphone size={18} /> : <Laptop size={18} />}
                </span>
                <div>
                  <strong>
                    {tUi(formatDevice(item.userAgent))}
                    {isCurrent ? <em>{tUi("Текущая")}</em> : null}
                  </strong>
                  <span>
                    {item.ipAddress || tUi("IP не определён")}  {' '}{tUi("· до")}{' '} {tUi(formatSessionDate(item.expiresAt, language))}
                  </span>
                </div>
                {isCurrent ? null : (
                  <Button size="sm" intent="neutral" appearance="soft"
                    type="button"
                    onClick={() => void revokeSession(item.token)}
                    aria-label={tUi("Завершить сессию {p1}", { p1: tUi(formatDevice(item.userAgent)) })}
                  >
                    <LogOut size={15} />
                    {tUi("Завершить сессию")}</Button>
                )}
              </article>
            );
          })}
        </div>
        {sessionError ? <p className="settings-message settings-message-error" role="alert">{typeof (sessionError) === 'string' ? tUi((sessionError) as string) : (sessionError)}</p> : null}
      </div>
    </section>
  );
}
