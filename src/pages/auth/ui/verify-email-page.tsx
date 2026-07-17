import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeCheck } from 'lucide-react';
import { AuthShell } from './auth-shell';

export function VerifyEmailPage({ error, verified }: { error?: string; verified: boolean }) {
  const failed = !verified || Boolean(error);

  return (
    <AuthShell ariaLabel={failed ? 'Ссылка подтверждения недействительна' : 'Email подтверждён'}>
      <div className="auth-card auth-state-card">
        <span className={`auth-state-icon ${failed ? 'auth-state-icon-error' : ''}`} aria-hidden="true">
          {failed ? <AlertTriangle size={26} /> : <BadgeCheck size={26} />}
        </span>
        <div className="auth-card-head">
          <h2>{failed ? 'Ссылка не сработала' : 'Email подтверждён'}</h2>
          <p>
            {failed
              ? 'Ссылка устарела или уже была использована. Запросите новое письмо и повторите попытку.'
              : 'Аккаунт защищён, а адрес подтверждён. Теперь можно перейти в рабочее пространство.'}
          </p>
        </div>
        <div className="auth-state-actions">
          {failed ? (
            <Link className="auth-secondary-link" href="/login">
              Запросить новое письмо
            </Link>
          ) : (
            <Link className="auth-primary-link" href="/">
              Перейти в продукт
              <ArrowRight size={16} />
            </Link>
          )}
          <Link className="auth-text-link" href="/login">Перейти ко входу</Link>
        </div>
      </div>
    </AuthShell>
  );
}
