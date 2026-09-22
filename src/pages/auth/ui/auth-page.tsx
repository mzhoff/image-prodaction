'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { IdentityActions, restartIdentityLogin } from '@reverie/identity-client/react';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import { Button } from '@prodactionpro/ui-core/button';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from '@prodactionpro/ui-core/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, signIn, signUp } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';
import { getSafePostAuthPath } from '@/shared/auth/route-policy';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { AuthShell } from './auth-shell';
import { IdentityTerms } from './identity-terms';

import { getBehaviorAttribution, trackBehavior } from '@/shared/analytics/client';
import { useJourney } from '@/shared/analytics/use-journey';

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  mode: AuthMode;
  allowRegistration?: boolean;
  identityEnabled?: boolean;
  identityEmailEnabled?: boolean;
  identityTermsMethod?: 'telegram' | 'email';
}

export function AuthPage(props: AuthPageProps) {
  const tUi = useTranslations();
  const journey = useJourney('login');
  const journeyRef = useRef(journey); journeyRef.current = journey;
  useEffect(() => { const timer = setTimeout(() => journeyRef.current.event('ip_login_viewed'), 0); return () => clearTimeout(timer); }, []);
  const onLoginEvent = useCallback((event: { type: string; method: 'telegram' | 'email' }) => {
    const goals = { method_clicked: 'ip_login_method_clicked', challenge_ready: 'ip_login_challenge_ready',
      telegram_open: 'ip_telegram_open_clicked', terms_viewed: 'ip_login_terms_viewed', terms_accepted: 'ip_login_terms_accepted',
      succeeded: 'ip_login_succeeded', failed: 'ip_login_failed', expired: 'ip_login_expired' } as const;
    const goal = goals[event.type as keyof typeof goals];
    if (goal) journeyRef.current.event(goal, { method: event.method });
    if (event.type === 'succeeded') journeyRef.current.finish();
  }, []);
  const [identityStage, setIdentityStage] = useState('choose');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState('');
  const updateIdentityStage = useCallback((stage: string, busy: boolean) => {
    setIdentityStage(stage); setIdentityBusy(busy);
  }, []);
  async function restart() {
    setResetPending(true); setResetError('');
    try { trackBehavior('ip_login_restarted'); await restartIdentityLogin('/api/auth'); }
    catch { setResetPending(false); setResetError(tUi('Не удалось сбросить вход. Попробуйте ещё раз.')); }
  }
  if (props.identityEnabled) {
    return (
      <AuthShell ariaLabel={tUi("Войти в Reverie")} backAction={props.identityTermsMethod || identityStage !== 'choose' ? <button className="auth-back-link auth-restart-link" type="button" disabled={identityBusy || resetPending || identityStage === 'loading'} onClick={() => void restart()}><ArrowLeft size={16} aria-hidden="true" />{tUi('Выбрать другой способ входа')}</button> : undefined}>
        <div className="auth-card auth-entry-card auth-method-card">
          <div className="auth-card-head auth-card-head-no-badge"><h2>{tUi("Добро пожаловать")}</h2>{!props.identityTermsMethod && identityStage === 'choose' ? <p>{tUi("Войдите, чтобы создавать и сохранять свои проекты. В первый раз — познакомимся и настроим пространство под ваши задачи.")}</p> : null}</div>
          {props.identityTermsMethod ? <IdentityTerms method={props.identityTermsMethod} onPendingChange={setIdentityBusy} /> : <IdentityActions onLoginEvent={onLoginEvent} getAnalyticsContext={getBehaviorAttribution} translate={tUi} authPath="/api/auth" telegramMode="embedded" onEmbeddedStateChange={updateIdentityStage} showRestartAction={false} renderTerms={renderTelegramTerms} methods={props.identityEmailEnabled === false ? ['telegram'] : ['telegram', 'email']} />}
          {resetError ? <p className="auth-consent-error" role="alert">{resetError}</p> : null}
        </div>
      </AuthShell>
    );
  }
  return <EmailAuthPage {...props} />;
}

function renderTelegramTerms(continueLogin: () => Promise<void>) {
  return <IdentityTerms method="telegram" onContinue={continueLogin} />;
}

function EmailAuthPage({ mode, allowRegistration = true }: AuthPageProps) {
  const tUi = useTranslations();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = mode === 'login' ? tUi("Войти в Reverie") : tUi("Создать аккаунт");
  const subtitle = mode === 'login'
    ? tUi("Войдите в рабочее пространство и откройте продукт.")
    : tUi("Создайте доступ к рабочему пространству и сразу переходите в продукт.");
  const submitLabel = mode === 'login' ? tUi("Войти") : tUi("Зарегистрироваться");
  const switchHref = mode === 'login' ? '/register' : '/login';
  const switchPrompt = mode === 'login' ? tUi("Нет аккаунта?") : tUi("Уже есть аккаунт?");
  const switchAction = mode === 'login' ? tUi("Зарегистрироваться") : tUi("Войти");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && !name.trim()) {
      setError(tUi("Укажите имя и фамилию."));
      return;
    }
    if (mode === 'register' && !acceptedTerms) {
      setError(tUi("Подтвердите согласие с условиями сервиса."));
      return;
    }

    trackBehavior('ip_login_method_clicked', { method: 'email' });
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
        trackBehavior('ip_login_failed', { method: 'email' });
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

      trackBehavior('ip_login_succeeded', { method: 'email' });
      const requestedPath = typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('next');
      router.replace(getSafePostAuthPath(requestedPath));
      router.refresh();
    } catch (caughtError) {
      trackBehavior('ip_login_failed', { method: 'email' });
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell ariaLabel={title}>
      <div className="auth-card auth-entry-card">
        <div className="auth-card-head auth-card-head-no-badge">
          <h2>{mode === 'login' ? tUi("Войти") : title}</h2>
          <p>{subtitle}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <label>
              <span>{tUi("Имя и фамилия")}</span>
              <PuiInput
                type="text"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={tUi("Иван Петров")}
                autoComplete="name"
                disabled={pending}
                required
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <PuiInput
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
              <span>{tUi("Пароль")}</span>
              {mode === 'login' ? <Link href="/forgot-password">{tUi("Забыли пароль?")}</Link> : null}
            </span>
            <div className="auth-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={tUi("Минимум 8 символов")}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={128}
                disabled={pending}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={tUi("Показать или скрыть пароль")}
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
              <span>{tUi("Соглашаюсь с условиями сервиса и политикой конфиденциальности.")}</span>
            </label>
          ) : null}

          {error ? <p className="auth-form-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}

          <Button className="auth-submit" type="submit" intent="accent" size="md" disabled={pending} trailingIcon={<ArrowRight size={14} />}>
            {pending ? tUi("Подождите…") : submitLabel}
          </Button>
        </form>

        {mode === 'register' || allowRegistration ? (
          <div className="auth-switch">
            <span>{switchPrompt}</span>
            <Link href={switchHref} onClick={(event) => {
              const next = new URLSearchParams(window.location.search).get('next');
              if (next) { event.preventDefault(); router.push(`${switchHref}?next=${encodeURIComponent(getSafePostAuthPath(next))}`); }
            }}>{switchAction}</Link>
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}

function readAuthErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}
