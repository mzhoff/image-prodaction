'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCcw, X } from '@prodactionpro/ui-core/icons';
import type { WorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';
import styles from './ai-access-dialog.module.css';

const COPY = {
  'not-activated': { title: 'Дайте идеям продолжение', text: 'Подключите AI для этого пространства — и создавайте изображения, видео и истории.', action: 'Пополнить баланс' },
  'budget-exhausted': { title: 'Продолжим после пополнения', text: 'Доступного AI-бюджета не хватает для нового запроса.', action: 'Пополнить баланс' },
  'member-limit': { title: 'Ваш лимит закончился', text: 'Попросите владельца пространства увеличить ваш лимит.', action: 'Как продолжить' },
  'member-disabled': { title: 'Нужен доступ к AI', text: 'Попросите владельца пространства разрешить вам AI-запуски.', action: 'Как продолжить' },
  unavailable: { title: 'Восстановим доступ к AI', text: 'Владельцу пространства нужно проверить подключение с администратором бета-теста.', action: 'Как продолжить' },
};

export function AiAccessDialog({ workspaceId, status, checking, notice, onCheck, onClose }: {
  workspaceId: string; status?: WorkspaceAiAccess['status']; checking: boolean; notice: string; onCheck: () => void; onClose: () => void;
}) {
  const tUi = useTranslations();
  const ui_COPY = useUiCatalog(COPY, tUi);
  const openSubscriptions = useSubscriptions();
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const [details, setDetails] = useState(false);
  const copy = status && status !== 'connected' ? ui_COPY[status] : { title: tUi("Проверим доступ к AI"), text: tUi("Пока не удалось проверить подключение пространства."), action: '' };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.content}>
      <button type="button" className={styles.close} aria-label={tUi("Закрыть")} onClick={onClose}><X size={18} /></button>
      <div className={styles.art}><Image src="/stories/ai-access-portal.webp" alt="" fill sizes="480px" draggable={false} /></div>
      <span className={styles.eyebrow}>REVERIE · AI</span>
      <h2 id={titleId}>{copy.title}</h2>
      <p>{copy.text}</p>
      {details ? <p className={styles.details}>{status === 'member-limit' || status === 'member-disabled'
        ? tUi("Обратитесь к владельцу пространства. После изменения доступа нажмите «Проверить доступ».")
        : tUi("В бета-тесте доступ и пополнения подключает администратор в Telegram. Свяжитесь с ним, затем вернитесь и нажмите «Проверить доступ».")}</p> : null}
      <div className={styles.actions}>
        {copy.action && !details ? <button type="button" className={styles.primary} onClick={() => {
          if (status === 'not-activated' || status === 'budget-exhausted') { onClose(); openSubscriptions({ workspaceId, tab: 'budget', source: 'ai_access_dialog' }); }
          else setDetails(true);
        }}>{copy.action}</button> : null}
        <button type="button" onClick={onCheck} disabled={checking}><RefreshCcw size={14} />{checking ? tUi("Проверяем…") : tUi("Проверить доступ")}</button>
      </div>
      {notice ? <span className={styles.notice} role="status">{notice}</span> : null}
    </div>
  </dialog>;
}
