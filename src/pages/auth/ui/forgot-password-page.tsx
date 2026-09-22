'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Mail } from '@prodactionpro/ui-core/icons';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { authClient } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';
import { AuthShell } from './auth-shell';

export function ForgotPasswordPage() {
  const tUi = useTranslations();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: '/reset-password',
      });

      if (result.error) {
        setError(formatAuthError(result.error));
        return;
      }

      setSubmitted(true);
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell ariaLabel={tUi("Восстановление пароля")}>
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="auth-card-badge">
            <Mail size={14} />
            {tUi("Восстановление доступа")}</span>
          <h2>{submitted ? tUi("Проверьте почту") : tUi("Забыли пароль?")}</h2>
          <p>
            {submitted
              ? tUi("Запрос обработан. Если указанный email привязан к аккаунту, письмо со ссылкой уже отправлено. Проверьте входящие и папку «Спам».")
              : tUi("Укажите email аккаунта. Мы отправим защищённую ссылку для установки нового пароля.")}
          </p>
        </div>

        {submitted ? (
          <div className="auth-state-actions auth-recovery-actions">
            <button
              className="auth-secondary-button"
              type="button"
              onClick={() => {
                setError(null);
                setSubmitted(false);
              }}
            >
              {tUi("Отправить повторно")}</button>
            <Link className="auth-text-link" href="/login">
              <ArrowLeft size={15} />
              {tUi("Вернуться ко входу")}</Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
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
            {error ? <p className="auth-form-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? tUi("Отправляем…") : tUi("Отправить ссылку")}
              <span><ArrowRight size={16} /></span>
            </button>
            <Link className="auth-text-link" href="/login">
              <ArrowLeft size={15} />
              {tUi("Вернуться ко входу")}</Link>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
