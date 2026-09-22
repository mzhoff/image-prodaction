'use client';

import { useId, useState } from 'react';
import { LogOut } from '@prodactionpro/ui-core/icons';
import { clearWorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';
import { signOut } from '@/shared/auth/client';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';

export function WorkspaceSignOutButton() {
  const { text } = useInterfaceLocale();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const errorId = useId();

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await signOut();
      clearWorkspaceAiAccess();
      // Drop the old page and its private client state after server confirmation.
      window.location.replace('/login');
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={failed ? errorId : undefined}
        onClick={handleSignOut}
      >
        <LogOut size={16} aria-hidden="true" />
        {pending ? text('Выходим…', 'Signing out…') : text('Выйти', 'Sign out')}
      </button>
      {failed ? (
        <p id={errorId} className="auth-form-error" role="alert">
          {text('Не удалось выйти. Проверьте подключение и попробуйте ещё раз.', 'Could not sign out. Check your connection and try again.')}
        </p>
      ) : null}
    </>
  );
}
