'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { signIn, signUp } from '@/shared/auth/client';

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
        : await signUp.email({ ...credentials, name: name.trim() });

      if (result.error) {
        setError(formatAuthError(result.error));
        return;
      }

      router.replace('/');
      router.refresh();
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-promo" aria-label="Product access">
        <div className="auth-promo-content">
          <span className="auth-promo-kicker">
            <span />
            Доступ в рабочее пространство
          </span>
          <h1>Вход в пространство, где pipeline превращает идею в готовый визуал.</h1>
          <p>
            Аккаунт и серверная сессия защищают ваши документы, файлы и рабочее
            пространство между устройствами.
          </p>
        </div>
        <div className="auth-promo-stack">
          <div className="auth-metric-card">
            <div>
              <span>Операционный эффект</span>
              <strong>+340%</strong>
            </div>
            <div className="auth-bars" aria-hidden="true">
              {[20, 28, 35, 46, 52, 61, 74, 82, 94, 86, 98, 100].map((value, index) => (
                <i key={index} style={{ height: `${value}%` }} />
              ))}
            </div>
          </div>
          <div className="auth-note-card">
            <Sparkles size={18} />
            <div>
              <strong>Готово под командную работу</strong>
              <span>Workspace, приглашения и роли подключим поверх этой точки входа.</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="auth-form-area" aria-label={title}>
        <div className="auth-form-shell">
          <div className="auth-topline">
            <Link className="auth-logo" href="/" aria-label="Reverie home">
              <img className="auth-logo-default" src="/brand/reverie-logo-default.webp" alt="" />
              <img className="auth-logo-hover" src="/brand/reverie-logo-hover.webp" alt="" />
            </Link>
            <Link className="auth-home-link" href="/">В продукт</Link>
          </div>

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
                <span>Пароль</span>
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
        </div>
      </section>
    </main>
  );
}

function formatAuthError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (code.includes('USER_ALREADY_EXISTS')) return 'Аккаунт с таким email уже существует.';
  if (code.includes('INVALID_EMAIL_OR_PASSWORD')) return 'Неверный email или пароль.';
  if (code.includes('TOO_MANY_REQUESTS')) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';

  return 'Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.';
}
