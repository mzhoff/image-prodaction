'use client';

import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, useSession } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';

interface SecuritySettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

interface SessionInfo {
  id: string;
  token: string;
  createdAt: string | Date;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function SecuritySettings({ onDirtyChange }: SecuritySettingsProps) {
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
        setSessionError('Не удалось загрузить активные сессии.');
        return;
      }
      setSessions((result.data ?? []) as SessionInfo[]);
    } catch {
      setSessionError('Не удалось загрузить активные сессии.');
    } finally {
      setSessionsPending(false);
    }
  }, []);

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
      setError('Новый пароль и подтверждение не совпадают.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Новый пароль должен отличаться от текущего.');
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
          ? 'Пароль изменён. Остальные сессии завершены.'
          : 'Пароль успешно изменён.',
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
        setSessionError('Не удалось завершить выбранную сессию.');
        return;
      }
      setSessions((items) => items.filter((item) => item.token !== token));
    } catch {
      setSessionError('Не удалось завершить выбранную сессию.');
    }
  }

  async function revokeAllOtherSessions() {
    setSessionError(null);
    try {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        setSessionError('Не удалось завершить остальные сессии.');
        return;
      }
      await loadSessions();
    } catch {
      setSessionError('Не удалось завершить остальные сессии.');
    }
  }

  const currentToken = currentSession?.session.token;

  return (
    <section className="settings-section" aria-labelledby="settings-security-title">
      <header className="settings-section-head">
        <div>
          <h2 id="settings-security-title">Безопасность</h2>
          <p>Пароль и устройства, на которых выполнен вход.</p>
        </div>
      </header>

      <div className="settings-card">
        <div className="settings-card-head">
          <span><KeyRound size={18} /></span>
          <div>
            <h3>Сменить пароль</h3>
            <p>После смены можно завершить вход на всех остальных устройствах.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={changePassword}>
          <label>
            <span>Текущий пароль</span>
            <input
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
              <span>Новый пароль</span>
              <input
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
              <span>Повторите пароль</span>
              <input
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
            <input
              type="checkbox"
              checked={revokeOtherSessions}
              onChange={(event) => setRevokeOtherSessions(event.target.checked)}
              disabled={pending}
            />
            <span>
              <strong>Выйти на остальных устройствах</strong>
              <small>Текущая сессия останется активной.</small>
            </span>
          </label>
          {error ? <p className="settings-message settings-message-error" role="alert">{error}</p> : null}
          {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}
          <div className="settings-form-actions">
            <button className="settings-primary-button" type="submit" disabled={pending || !dirty}>
              <ShieldCheck size={16} />
              {pending ? 'Меняем…' : 'Сменить пароль'}
            </button>
          </div>
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card-head settings-card-head-split">
          <div className="settings-card-title">
            <span><Laptop size={18} /></span>
            <div>
              <h3>Активные сессии</h3>
              <p>Проверьте устройства и завершите незнакомые подключения.</p>
            </div>
          </div>
          <button
            className="settings-quiet-button"
            type="button"
            onClick={() => void revokeAllOtherSessions()}
            disabled={sessionsPending || sessions.length <= 1}
          >
            Завершить остальные
          </button>
        </div>

        {sessionsPending ? <p className="settings-empty">Загружаем сессии…</p> : null}
        {!sessionsPending && sessions.length === 0 ? (
          <p className="settings-empty">Активные сессии не найдены.</p>
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
                    {formatDevice(item.userAgent)}
                    {isCurrent ? <em>Текущая</em> : null}
                  </strong>
                  <span>
                    {item.ipAddress || 'IP не определён'} · до {formatSessionDate(item.expiresAt)}
                  </span>
                </div>
                {isCurrent ? null : (
                  <button
                    type="button"
                    onClick={() => void revokeSession(item.token)}
                    aria-label={`Завершить сессию ${formatDevice(item.userAgent)}`}
                  >
                    <LogOut size={15} />
                    Завершить сессию
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {sessionError ? <p className="settings-message settings-message-error" role="alert">{sessionError}</p> : null}
      </div>
    </section>
  );
}

function isMobileUserAgent(userAgent?: string | null) {
  return /android|iphone|ipad|mobile/i.test(userAgent ?? '');
}

function formatDevice(userAgent?: string | null) {
  if (!userAgent) return 'Неизвестное устройство';
  if (/iphone|ipad/i.test(userAgent)) return 'Safari на iOS';
  if (/android/i.test(userAgent)) return 'Браузер на Android';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/chrome/i.test(userAgent)) return 'Google Chrome';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Браузер';
}

function formatSessionDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'неизвестной даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPasswordChangeError(error: unknown) {
  const code = readErrorCode(error);
  if (code === 'INVALID_PASSWORD') return 'Текущий пароль указан неверно.';
  if (code === 'PASSWORD_TOO_SHORT') return 'Новый пароль должен содержать минимум 8 символов.';
  return formatAuthError(error);
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}
