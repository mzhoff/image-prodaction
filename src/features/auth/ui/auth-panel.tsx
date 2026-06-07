'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { signOut, useSession } from '@/shared/auth/client';
import { getAuthErrorMessage } from '@/features/auth/lib/auth-form-utils';

export function AuthPanel() {
  const { data: session, isPending, refetch } = useSession();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userEmail = session?.user.email;
  const statusLabel = useMemo(() => {
    if (isPending) return 'Проверка';
    if (userEmail) return userEmail;
    return 'Гость';
  }, [isPending, userEmail]);

  async function handleSignOut() {
    setBusy(true);
    setActionError(null);

    try {
      const result = await signOut();
      if (result.error) {
        setActionError(getAuthErrorMessage(result.error));
        return;
      }

      await refetch();
    } catch (error) {
      setActionError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (userEmail) {
    return (
      <div className="auth-panel auth-panel-signed-in">
        <span className="auth-user" title={userEmail}>
          {statusLabel}
        </span>
        <button type="button" className="auth-icon-button" onClick={handleSignOut} disabled={busy} aria-label="Выйти">
          <LogOut size={16} />
        </button>
        {actionError ? <span className="auth-panel-error">{actionError}</span> : null}
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <span className="auth-user auth-user-guest">{statusLabel}</span>
      <Link href="/login" className="auth-nav-link">
        <LogIn size={16} />
        <span>Вход</span>
      </Link>
      <Link href="/register" className="auth-nav-link auth-nav-link-primary">
        <UserPlus size={16} />
        <span>Регистрация</span>
      </Link>
    </div>
  );
}
