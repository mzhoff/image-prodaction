'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { ArrowLeft, MailCheck } from '@prodactionpro/ui-core/icons';
import { useEffect, useState } from 'react';
import { authClient } from '@/shared/auth/client';
import { AuthShell } from './auth-shell';

const RESEND_COOLDOWN_SECONDS = 60;

export function CheckEmailPage({ email }: { email: string }) {
  const tUi = useTranslations();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function resend() {
    if (!email || cooldown > 0 || pending) return;
    setPending(true);
    setNotice(null);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/verify-email',
      });
    } finally {
      // Keep this response generic to avoid revealing whether an address exists.
      setPending(false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(tUi("Если адрес зарегистрирован и ещё не подтверждён, новое письмо уже в пути."));
    }
  }

  return (
    <AuthShell ariaLabel={tUi("Подтверждение email")}>
      <div className="auth-card auth-state-card">
        <span className="auth-state-icon" aria-hidden="true"><MailCheck size={26} /></span>
        <div className="auth-card-head">
          <h2>{tUi("Проверьте почту")}</h2>
          <p>
            {tUi("Мы отправили ссылку для подтверждения")}{email ? <>  {' '}{tUi("на")}{' '} <strong>{email}</strong></> : tUi(" на указанный адрес")}{tUi(". Без подтверждения войти в Reverie не получится.")}</p>
        </div>

        {notice ? <p className="auth-form-success" role="status">{typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}</p> : null}

        <div className="auth-state-actions">
          <button
            className="auth-secondary-button"
            type="button"
            onClick={() => void resend()}
            disabled={!email || pending || cooldown > 0}
          >
            {pending
              ? tUi("Отправляем…")
              : cooldown > 0
                ? tUi("Отправить письмо ещё раз через {p1} с", { p1: cooldown })
                : tUi("Отправить письмо ещё раз")}
          </button>
          <Link className="auth-text-link" href="/login">
            <ArrowLeft size={15} />
            {tUi("Вернуться ко входу")}</Link>
        </div>
      </div>
    </AuthShell>
  );
}
