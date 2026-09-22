'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { SectionHelpButton } from '@/shared/ui/section-help';
import Link from 'next/link';
import { MessageSquare, Film, Route } from '@prodactionpro/ui-core/icons';
import { useProductionChats } from '@/features/chat-assistant/model/use-production-chats';
import { useWorkspaceShell } from './workspace-shell-context';
import { ProductionChatActions } from './production-chat-actions';
import styles from './production-chats.module.css';

/** Contextual project conversations; there is no standalone chat archive screen. */
export function ProjectChatsPanel({ folderId }: { folderId: string }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const { activeWorkspace } = useWorkspaceShell();
  const chats = useProductionChats(activeWorkspace?.id, 'active', folderId);
  return <section className={`${styles.page} ${styles.compact}`} aria-label={tUi("Чаты проекта")}>
    <header className={styles.header}><div><span>PRODUCTION</span><h1>{tUi("Чаты проекта")}</h1></div><SectionHelpButton section="chats" label={tUi("Как устроены чаты")} /></header>
    {chats.error ? <p role="alert">{typeof (chats.error) === 'string' ? tUi((chats.error) as string) : (chats.error)} <button type="button" onClick={chats.refresh}>{tUi("Повторить")}</button></p> : null}
    <div className={styles.list} aria-busy={chats.loading}>
      {chats.items.map((chat) => <article className={styles.row} key={chat.id}>
        <span className={styles.icon}>{chat.kind === 'flow' ? <Route size={20} /> : chat.kind === 'storyboard' ? <Film size={20} /> : <MessageSquare size={20} />}</span>
        <div className={styles.body}>{chat.status === 'active' ? <Link href={chat.href}>{chat.title}</Link> : <strong>{chat.title}</strong>}
          <p>{chat.kind === 'flow' ? 'Flow' : chat.kind === 'storyboard' ? 'Storyboard' : tUi("Диалог")}{chat.artifactName ? ` · ${chat.artifactName}` : ''} · {new Date(chat.updatedAt).toLocaleDateString(language, { day: 'numeric', month: 'short' })}</p></div>
        {activeWorkspace ? <ProductionChatActions chat={chat} workspaceId={activeWorkspace.id} /> : null}
      </article>)}
    </div>
    {!chats.items.length && !chats.error ? <p className={styles.empty}>{chats.loading ? tUi("Загружаем чаты…") : tUi("Добавьте сюда чат через меню «В проект с материалами».")}</p> : null}
  </section>;
}
