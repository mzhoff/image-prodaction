'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useId, useState } from 'react';
import { ArrowUpRight, RefreshCcw } from '@prodactionpro/ui-core/icons';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';
import styles from './ai-access-banner.module.css';

export function AiAccessBanner({ workspaceId, status, onCheck, checking = false, checkError }: {
  workspaceId?: string; status: 'not-activated' | 'unavailable'; onCheck: () => void; checking?: boolean; checkError?: string;
}) {
  const tUi = useTranslations();
  const openSubscriptions = useSubscriptions();
  const [requested, setRequested] = useState(false);
  const titleId = useId();
  return <aside className={styles.banner} aria-labelledby={titleId}>
    <div className={styles.art} aria-hidden="true"><Image src="/stories/ai-access-portal.webp" alt="" fill sizes="(max-width: 700px) 90vw, 480px" draggable={false} /></div>
    <div className={styles.content}>
      <span className={styles.eyebrow}>{tUi("REVERIE AI · ВАШЕ ПРОСТРАНСТВО")}</span>
      <h3 id={titleId}>{status === 'not-activated' ? tUi("Дайте идеям продолжение") : tUi("Вернёмся к творчеству")}</h3>
      <p>{status === 'not-activated' ? tUi("Создавайте изображения и развивайте истории вместе с AI. Осталось подключить доступ.") : tUi("AI-подключению нужно внимание. Проверьте доступ, чтобы продолжить работу.")}</p>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" disabled={checking} onClick={() => { setRequested(true); onCheck(); }}><RefreshCcw size={13} className={checking ? styles.spinning : undefined} />{checking ? tUi("Проверяем…") : tUi("Проверить доступ")}</button>
        <button className={styles.secondary} type="button" onClick={() => openSubscriptions({ workspaceId, tab: 'budget', source: 'ai_access_banner' })} aria-haspopup="dialog">{tUi("Пополнить баланс")}<ArrowUpRight size={13} /></button>
      </div>
      <div className={styles.status} role="status">{checkError || (checking ? tUi("Проверяем доступ пространства…") : requested ? status === 'not-activated' ? tUi("Доступ ещё не активирован. Нажмите «Пополнить баланс».") : tUi("Подключение пока недоступно. Попробуйте проверить доступ позже.") : status === 'not-activated' ? tUi("AI-доступ ещё не активирован") : null)}</div>
    </div>
  </aside>;
}
