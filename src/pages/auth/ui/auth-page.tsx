'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, signIn, signUp } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';
import { getSafePostAuthPath } from '@/shared/auth/route-policy';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { AuthShell } from './auth-shell';

type AuthMode = 'login' | 'register';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = mode === 'login' ? 'Войти в Reverie' : 'Создать аккаунт';
  const subtitle = mode === 'login'
    ? 'Войдите в рабочее пространство и откройте продукт.'
    : 'Создайте доступ к рабочему пространству и сразу переходите в продукт.';
  const submitLabel = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
  const switchHref = mode === 'login' ? '/register' : '/login';
  const switchLabel = mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && !name.trim()) {
      setError('Укажите имя и фамилию.');
      return;
    }
    if (mode === 'register' && !acceptedTerms) {
      setError('Подтвердите согласие с условиями сервиса.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const credentials = { email: email.trim(), password };
      const result = mode === 'login'
        ? await signIn.email({ ...credentials, rememberMe: true })
        : await signUp.email({
          ...credentials,
          name: name.trim(),
          callbackURL: '/verify-email',
          termsAccepted: acceptedTerms,
          termsVersion: CURRENT_TERMS_VERSION,
        });

      if (result.error) {
        if (mode === 'login' && readAuthErrorCode(result.error) === 'EMAIL_NOT_VERIFIED') {
          try {
            await authClient.sendVerificationEmail({
              email: email.trim(),
              callbackURL: '/verify-email',
            });
          } catch {
            // The destination stays generic even if local SMTP is temporarily unavailable.
          }
          router.replace(`/check-email?email=${encodeURIComponent(email.trim())}`);
          return;
        }
        setError(formatAuthError(result.error));
        return;
      }

      if (mode === 'register') {
        router.replace(`/check-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }

      const requestedPath = typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('next');
      router.replace(getSafePostAuthPath(requestedPath));
      router.refresh();
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell ariaLabel={title}>
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="auth-card-badge">
            <TrendingUp size={14} />
            Защищённый доступ
          </span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <label>
              <span>Имя и фамилия</span>
              <input
                type="text"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Иван Петров"
                autoComplete="name"
                disabled={pending}
                required
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="team@reverie.app"
              autoComplete="email"
              disabled={pending}
              required
            />
          </label>
          <label>
            <span className="auth-label-row">
              <span>Пароль</span>
              {mode === 'login' ? <Link href="/forgot-password">Забыли пароль?</Link> : null}
            </span>
            <div className="auth-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Минимум 8 символов"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={128}
                disabled={pending}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label="Показать или скрыть пароль"
                disabled={pending}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {mode === 'register' ? (
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                disabled={pending}
                required
              />
              <span>Соглашаюсь с условиями сервиса и политикой конфиденциальности.</span>
            </label>
          ) : null}

          {error ? <p className="auth-form-error" role="alert">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? 'Подождите…' : submitLabel}
            <span>
              <ArrowRight size={16} />
            </span>
          </button>
        </form>

        <p className="auth-disclaimer">
          Вход сохраняется в защищённой серверной сессии. Пароль не попадает в браузерное хранилище.
        </p>

        <div className="auth-switch">
          <Link href={switchHref}>{switchLabel}</Link>
        </div>
      </div>
    </AuthShell>
  );
}

function readAuthErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}
