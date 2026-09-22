'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/use-translations';
import { newCreationDraft, submitCreation } from '../model/create-draft';
import styles from './flow-creation.module.css';

/** Opening a Flow creates only its document. The assistant starts on the canvas. */
export function FlowCreation({ workspaceId }: { workspaceId: string }) {
  const tUi = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const [draft] = useState(() => newCreationDraft(params?.get('folderId') ?? ''));
  const [attempt, retry] = useState(0);
  const [failed, setFailed] = useState(false);
  const flight = useRef<Promise<string> | null>(null);
  const existingId = params?.get('document');

  useEffect(() => {
    let active = true;
    // Strict Mode replays effects. Reuse the request and creationId, including retries.
    flight.current ??= existingId ? Promise.resolve(existingId) : submitCreation(workspaceId, 'flow', draft);
    void flight.current.then((id) => {
      if (active) router.replace(`/projects/${encodeURIComponent(id)}?assistant=1`);
    }, () => {
      if (active) { flight.current = null; setFailed(true); }
    });
    return () => { active = false; };
  }, [attempt, draft, existingId, router, workspaceId]);

  return <div className={styles.page} aria-busy={!failed}>
    <div className={styles.status} role={failed ? 'alert' : 'status'}>
      <p>{tUi(failed ? 'Не удалось открыть Flow. Попробуйте ещё раз.' : 'Открываем чистый холст…')}</p>
      {failed ? <button type="button" onClick={() => { setFailed(false); retry((value) => value + 1); }}>{tUi('Повторить')}</button> : null}
      <Link href="/flows">{tUi('К Flows')}</Link>
    </div>
  </div>;
}
