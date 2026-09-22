'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from '@prodactionpro/ui-core/icons';
import { createUuidV7 } from '@/shared/lib/id';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { useWorkspaceShell } from './workspace-shell-context';

export function WorkspaceCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const { text } = useInterfaceLocale();
  const workspace = useWorkspaceShell();
  const router = useRouter();
  const [creationId] = useState(() => createUuidV7());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  return <form className="production-workspace-create production-ecosystem-products" aria-label={text('Новое пространство', 'New workspace')}
    onSubmit={async (event) => {
      event.preventDefault();
      if (!name.trim() || submitting.current) return;
      submitting.current = true; setBusy(true); setError('');
      try {
        await workspace.createWorkspace(name.trim(), creationId);
        router.push('/');
        onCreated();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : text('Не удалось создать пространство. Попробуйте ещё раз.', 'Could not create the workspace. Try again.'));
      } finally { submitting.current = false; setBusy(false); }
    }}>
    <h2>{text('Новое пространство', 'New workspace')}</h2>
    <p>{text('Отдельное место для ваших проектов, файлов и чатов.', 'A separate home for your projects, files and chats.')}</p>
    <label htmlFor="new-workspace-name">{text('Название', 'Name')}</label>
    <input ref={input} id="new-workspace-name" value={name} onChange={(event) => setName(event.target.value)}
      placeholder={text('Например, Моя студия', 'For example, My studio')} required maxLength={120} disabled={busy} autoComplete="off" />
    {error ? <p role="alert">{error}</p> : null}
    <footer><button type="button" onClick={onCancel} disabled={busy}>{text('Отмена', 'Cancel')}</button>
      <button type="submit" disabled={busy || !name.trim()}>{busy ? <LoaderCircle size={16} className="production-workspace-create-spinner" /> : <ArrowRight size={16} />}
        {busy ? text('Создаём…', 'Creating…') : text('Создать пространство', 'Create workspace')}</button></footer>
  </form>;
}
