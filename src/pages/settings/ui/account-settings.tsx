'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { ModelPreferencesSettings } from '@/features/model-selector/ui/model-preferences-settings';
import { ThemeControl } from '@/shared/ui/theme-control';

import { BadgeCheck, MailWarning, Save, UserRound } from '@prodactionpro/ui-core/icons';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { authClient, useSession } from '@/shared/auth/client';
import { formatAuthError } from '@/shared/auth/error-message';

interface AccountSettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

export function AccountSettings({ onDirtyChange }: AccountSettingsProps) {
  const tUi = useTranslations();
  const [appearanceContainer, setAppearanceContainer] = useState<HTMLElement | null>(null);
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [pending, setPending] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const originalName = session?.user.name ?? '';
  const dirty = name.trim() !== savedName;

  useEffect(() => {
    setName(originalName);
    setSavedName(originalName);
  }, [originalName]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const result = await authClient.updateUser({ name: name.trim() });
      if (result.error) {
        setError(formatAuthError(result.error));
        return;
      }
      setSavedName(name.trim());
      setMessage(tUi("Изменения сохранены."));
    } catch (caughtError) {
      setError(formatAuthError(caughtError));
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    const email = session?.user.email;
    if (!email || verificationPending || verificationSent) return;
    setVerificationPending(true);
    setError(null);
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/verify-email',
      });
    } finally {
      setVerificationPending(false);
      setVerificationSent(true);
      setMessage(tUi("Если адрес ещё не подтверждён, новое письмо уже в пути."));
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-account-title">
      <header className="settings-section-head">
        <div>
          <h2 id="settings-account-title">{tUi("Профиль")}</h2>
        </div>
      </header>

      <form className="settings-card settings-form" onSubmit={handleSubmit}>
        <div className="settings-profile-summary"><span className="settings-profile-avatar" aria-hidden="true"><UserRound size={26} /></span>
          <div><h3>{originalName || tUi("Ваш профиль")}</h3><p>{tUi("Личные данные")}</p></div></div>
        <label>
          <span>{tUi("Имя и фамилия")}</span>
          <PuiInput
            type="text"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setMessage(null);
            }}
            autoComplete="name"
            minLength={2}
            maxLength={80}
            disabled={pending || !session}
            required
          />
        </label>
        <label>
          <span>Email</span>
          <PuiInput
            type="email"
            value={session?.user.email ?? ''}
            autoComplete="email"
            disabled
            readOnly
          />
        </label>

        <div className={`settings-verification ${session?.user.emailVerified ? 'settings-verification-ok' : ''}`}>
          {session?.user.emailVerified ? <BadgeCheck size={18} /> : <MailWarning size={18} />}
          <div>
            <strong>{session?.user.emailVerified ? tUi("Email подтверждён") : tUi("Email не подтверждён")}</strong>
            <span>
              {session?.user.emailVerified
                ? tUi("Адрес для восстановления доступа.")
                : tUi("Подтвердите адрес для восстановления доступа.")}
            </span>
          </div>
          {session?.user.emailVerified ? null : (
            <Button size="sm" intent="neutral" appearance="soft"
              type="button"
              onClick={() => void resendVerification()}
              disabled={verificationPending || verificationSent}
            >
              {verificationPending
                ? tUi("Отправляем…")
                : verificationSent
                  ? tUi("Письмо отправлено")
                  : tUi("Отправить подтверждение")}
            </Button>
          )}
        </div>

        {error ? <p className="settings-message settings-message-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
        {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}

        <div className="settings-form-actions">
          <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit" disabled={!dirty || pending}>
            <Save size={16} />
            {pending ? tUi("Сохраняем…") : tUi("Сохранить")}
          </Button>
        </div>
      </form>
      <section ref={setAppearanceContainer} className="settings-card settings-appearance-card" aria-labelledby="settings-appearance-title">
        <div><h3 id="settings-appearance-title">{tUi("Оформление")}</h3></div>
        <ThemeControl menuClassName="settings-select-menu" portalContainer={appearanceContainer?.closest('.settings-dialog')} />
      </section>
      <ModelPreferencesSettings />
    </section>
  );
}
