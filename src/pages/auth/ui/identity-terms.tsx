'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useState } from 'react';
import { Button } from '@prodactionpro/ui-core/button';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { getSafePostAuthPath } from '@/shared/auth/route-policy';

/** Product-specific consent copy; the public SDK endpoint still owns OIDC,
 * browser proof, terms enforcement, and session creation. */
export function IdentityTerms({ method, onContinue, onPendingChange }: { method: 'telegram' | 'email'; onContinue?: () => Promise<void>; onPendingChange?: (pending: boolean) => void }) {
  const tUi = useTranslations();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);

  async function continueLogin() {
    if (!accepted || pending) return;
    setPending(true); setError('');
    try {
      if (onContinue) { await onContinue(); setPending(false); return; }
      const response = await fetch('/api/auth/identity/start', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ intent: 'login', method, termsAccepted: true,
          returnTo: getSafePostAuthPath(new URLSearchParams(window.location.search).get('next')) }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.url !== 'string') throw new Error('start_failed');
      const destination = new URL(body.url);
      if (destination.protocol !== 'https:' && !(destination.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(destination.hostname))) throw new Error('invalid_destination');
      window.location.assign(destination.href);
    } catch {
      setError(tUi("Не удалось продолжить вход. Проверьте соединение и попробуйте ещё раз."));
      setPending(false);
    }
  }

  return <section className="auth-consent" aria-label={tUi("Условия регистрации")}>
    <p>{tUi("Подтвердите условия, чтобы завершить регистрацию.")}</p>
    <div className="auth-consent-check">
      <input id="product-terms" type="checkbox" checked={accepted} disabled={pending} onChange={(event) => setAccepted(event.target.checked)} aria-labelledby="product-terms-label" />
      <span id="product-terms-label"><label htmlFor="product-terms">{tUi("Принимаю")}{' '} </label><ProTooltip label={tUi("Ссылка на условия появится здесь позже")}><button type="button" className="auth-terms-link" aria-label={tUi("Условия использования продукта — ссылка скоро появится")}>{tUi("условия использования продукта")}</button></ProTooltip>.</span>
    </div>
    {error ? <p className="auth-consent-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    <Button className="auth-consent-continue" type="button" disabled={!accepted || pending} onClick={() => void continueLogin()}>{pending ? tUi("Продолжаем…") : tUi("Продолжить")}</Button>
  </section>;
}
