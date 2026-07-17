'use client';

import { BadgeCheck, MailWarning, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, useSession } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';

interface AccountSettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

export function AccountSettings({ onDirtyChange }: AccountSettingsProps) {
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [pending, setPending] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const originalName = session?.user.name ?? '';
  const dirty = name.trim() !== savedName;

  useEffect(() => {
    setName(originalName);
    setSavedName(originalName);
  }, [originalName]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const result = await authClient.updateUser({ name: name.trim() });
      if (result.error) {
        setError(formatAuthError(result.error));
        return;
      }
      setSavedName(name.trim());
      setMessage('Изменения сохранены.');
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    const email = session?.user.email;
    if (!email || verificationPending || verificationSent) return;
    setVerificationPending(true);
    setError(null);
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/verify-email',
      });
    } finally {
      setVerificationPending(false);
      setVerificationSent(true);
      setMessage('Если адрес ещё не подтверждён, новое письмо уже в пути.');
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-account-title">
      <header className="settings-section-head">
        <div>
          <h2 id="settings-account-title">Аккаунт</h2>
          <p>Основные данные профиля и статус email.</p>
        </div>
      </header>

      <form className="settings-form" onSubmit={handleSubmit}>
        <label>
          <span>Имя и фамилия</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setMessage(null);
            }}
            autoComplete="name"
            minLength={2}
            maxLength={80}
            disabled={pending || !session}
            required
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={session?.user.email ?? ''}
            autoComplete="email"
            disabled
            readOnly
          />
          <small>Смену email подключим отдельным подтверждаемым сценарием.</small>
        </label>

        <div className={`settings-verification ${session?.user.emailVerified ? 'settings-verification-ok' : ''}`}>
          {session?.user.emailVerified ? <BadgeCheck size={18} /> : <MailWarning size={18} />}
          <div>
            <strong>{session?.user.emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}</strong>
            <span>
              {session?.user.emailVerified
                ? 'Этот адрес можно использовать для восстановления доступа.'
                : 'Подтвердите адрес, чтобы продолжить пользоваться аккаунтом.'}
            </span>
          </div>
          {session?.user.emailVerified ? null : (
            <button
              type="button"
              onClick={() => void resendVerification()}
              disabled={verificationPending || verificationSent}
            >
              {verificationPending
                ? 'Отправляем…'
                : verificationSent
                  ? 'Письмо отправлено'
                  : 'Отправить подтверждение'}
            </button>
          )}
        </div>

        {error ? <p className="settings-message settings-message-error" role="alert">{error}</p> : null}
        {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}

        <div className="settings-form-actions">
          <button className="settings-primary-button" type="submit" disabled={!dirty || pending}>
            <Save size={16} />
            {pending ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </section>
  );
}
