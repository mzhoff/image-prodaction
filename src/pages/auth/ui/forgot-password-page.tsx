'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { authClient } from '@/shared/auth/client';
import { AuthShell } from './auth-shell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: '/reset-password',
      });
    } finally {
      // The response is deliberately identical for known and unknown addresses.
      setPending(false);
      setSubmitted(true);
    }
  }

  return (
    <AuthShell ariaLabel="Восстановление пароля">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="auth-card-badge">
            <Mail size={14} />
            Восстановление доступа
          </span>
          <h2>{submitted ? 'Проверьте почту' : 'Забыли пароль?'}</h2>
          <p>
            {submitted
              ? 'Если аккаунт с таким email существует, мы отправили ссылку для смены пароля.'
              : 'Укажите email аккаунта. Мы отправим защищённую ссылку для установки нового пароля.'}
          </p>
        </div>

        {submitted ? (
          <div className="auth-state-actions">
            <button className="auth-secondary-button" type="button" onClick={() => setSubmitted(false)}>
              Отправить повторно
            </button>
            <Link className="auth-text-link" href="/login">
              <ArrowLeft size={15} />
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
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
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? 'Отправляем…' : 'Отправить ссылку'}
              <span><ArrowRight size={16} /></span>
            </button>
            <Link className="auth-text-link" href="/login">
              <ArrowLeft size={15} />
              Вернуться ко входу
            </Link>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
