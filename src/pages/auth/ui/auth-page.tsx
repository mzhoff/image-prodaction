'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';

type AuthMode = 'login' | 'register';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const title = mode === 'login' ? 'Войти в Reverie' : 'Создать аккаунт';
  const subtitle = mode === 'login'
    ? 'Войдите в рабочее пространство и откройте продукт.'
    : 'Создайте доступ к рабочему пространству и сразу переходите в продукт.';
  const submitLabel = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
  const switchHref = mode === 'login' ? '/register' : '/login';
  const switchLabel = mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';

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
            Пока это фронтовый сценарий входа. Он уже готов под backend-сессию,
            workspace, роли и приглашения команды.
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
                Прототип авторизации
              </span>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                router.push('/');
              }}
            >
              {mode === 'register' ? (
                <label>
                  <span>Имя и фамилия</span>
                  <input type="text" placeholder="Иван Петров" />
                </label>
              ) : null}
              <label>
                <span>Email</span>
                <input type="email" placeholder="team@reverie.app" />
              </label>
              <label>
                <span>Пароль</span>
                <div className="auth-password-field">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Минимум 8 символов" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="Показать или скрыть пароль"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {mode === 'register' ? (
                <label className="auth-checkbox">
                  <input type="checkbox" />
                  <span>Соглашаюсь с условиями сервиса и политикой конфиденциальности.</span>
                </label>
              ) : null}

              <button className="auth-submit" type="submit">
                {submitLabel}
                <span>
                  <ArrowRight size={16} />
                </span>
              </button>
            </form>

            <div className="auth-provider-block">
              <button type="button">
                <CheckCircle2 size={16} />
                Continue with Google
              </button>
            </div>

            <p className="auth-disclaimer">
              Сейчас это UX-прототип. Кнопка отправки открывает workspace без проверки полей.
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
