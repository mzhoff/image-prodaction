'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { authClient } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';
import { AuthShell } from './auth-shell';

interface ResetPasswordPageProps {
  token?: string;
  linkError?: string;
}

export function ResetPasswordPage({ token, linkError }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [tokenRejected, setTokenRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidLink = Boolean(linkError || !token || tokenRejected);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirmation) {
      setError('Пароли не совпадают.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        if (readAuthErrorCode(result.error) === 'INVALID_TOKEN') {
          setTokenRejected(true);
          return;
        }
        setError(formatAuthError(result.error));
        return;
      }
      setComplete(true);
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  if (invalidLink) {
    return (
      <AuthShell ariaLabel="Ссылка сброса пароля недействительна">
        <div className="auth-card auth-state-card">
          <span className="auth-state-icon auth-state-icon-error" aria-hidden="true">
            <AlertTriangle size={26} />
          </span>
          <div className="auth-card-head">
            <h2>Ссылка недействительна</h2>
            <p>Срок действия ссылки закончился или она уже была использована.</p>
          </div>
          <Link className="auth-primary-link" href="/forgot-password">Запросить новую ссылку</Link>
        </div>
      </AuthShell>
    );
  }

  if (complete) {
    return (
      <AuthShell ariaLabel="Пароль изменён">
        <div className="auth-card auth-state-card">
          <span className="auth-state-icon" aria-hidden="true"><KeyRound size={26} /></span>
          <div className="auth-card-head">
            <h2>Пароль изменён</h2>
            <p>Все прежние сессии завершены. Войдите с новым паролем.</p>
          </div>
          <Link className="auth-primary-link" href="/login">
            Перейти ко входу
            <ArrowRight size={16} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell ariaLabel="Установка нового пароля">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="auth-card-badge"><KeyRound size={14} /> Новый пароль</span>
          <h2>Защитите аккаунт</h2>
          <p>Придумайте новый пароль длиной не менее 8 символов.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Новый пароль</span>
            <div className="auth-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                disabled={pending}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label="Показать или скрыть пароль"
                disabled={pending}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label>
            <span>Повторите пароль</span>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              disabled={pending}
              required
            />
          </label>
          {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить новый пароль'}
            <span><ArrowRight size={16} /></span>
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

function readAuthErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}
