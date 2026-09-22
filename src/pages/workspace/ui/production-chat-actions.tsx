'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, useState } from 'react';
import { Archive, Folder, MoreHorizontal, Pencil, Trash2, Undo2, X } from '@prodactionpro/ui-core/icons';
import type { ProductionChatChange, ProductionChatSummary } from '@/modules/chat-assistant/contracts/production-chats';
import { changeChat } from '@/features/chat-assistant/model/use-production-chats';
import { ContextMenu } from '@/shared/ui/context-menu';
import { useWorkspaceShell } from './workspace-shell-context';
import styles from './production-chats.module.css';

export function ProductionChatActions({ chat, workspaceId }: { chat: ProductionChatSummary; workspaceId: string }) {
  const tUi = useTranslations();
  const [dialog, setDialog] = useState<'rename' | 'move' | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(null); trigger.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);
  const change = async (input: ProductionChatChange) => {
    if (busy) return; setBusy(true); setError(''); setMenu(null);
    try { await changeChat(workspaceId, chat.id, input); setDialog(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось изменить чат.")); }
    finally { setBusy(false); }
  };
  return <div className={styles.actions}>
    <button ref={trigger} type="button" className={styles.menuTrigger} disabled={busy} aria-label={tUi("Действия чата {p1}", { p1: chat.title })} aria-expanded={Boolean(menu)} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { x: rect.right - 235, y: rect.bottom + 4 });
    }}><MoreHorizontal size={18} /></button>
    <ContextMenu onClose={() => setMenu(null)} menu={menu ? { ...menu, minWidth: 235, actions: [
      { id: 'rename', label: tUi("Переименовать"), icon: <Pencil size={14} />, onSelect: () => { setError(''); setDialog('rename'); } },
      { id: 'move', label: tUi("В проект с материалами"), icon: <Folder size={14} />, onSelect: () => { setError(''); setDialog('move'); } },
      { id: 'archive', label: chat.status === 'active' ? tUi("В архив") : tUi("Восстановить"), icon: chat.status === 'active' ? <Archive size={14} /> : <Undo2 size={14} />, onSelect: () => void change({ action: chat.status === 'active' ? 'archive' : 'restore' }) },
      ...(chat.status !== 'deleted' ? [{ id: 'delete', label: tUi("В корзину"), icon: <Trash2 size={14} />, destructive: true, onSelect: () => void change({ action: 'delete' }) }] : []),
    ] } : null} />
    {error && !dialog ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    {dialog ? <ChatDialog chat={chat} kind={dialog} busy={busy} error={typeof (error) === 'string' ? tUi((error) as string) : (error)} onClose={() => setDialog(null)} onSave={change} /> : null}
  </div>;
}
function ChatDialog({ chat, kind, busy, error, onClose, onSave }: { chat: ProductionChatSummary; kind: 'rename' | 'move'; busy: boolean; error: string; onClose: () => void; onSave: (change: ProductionChatChange) => Promise<void> }) {
  const tUi = useTranslations();
  const element = useRef<HTMLDialogElement>(null);
  const workspace = useWorkspaceShell();
  const [title, setTitle] = useState(chat.title), [folderId, setFolderId] = useState(chat.folderId);
  useEffect(() => { const dialog = element.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={element} className={styles.dialog} aria-label={kind === 'rename' ? tUi("Название чата") : tUi("Перенос чата в проект")} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void onSave(kind === 'rename' ? { action: 'rename', title } : { action: 'move', folderId }); }}>
      <header><h2>{kind === 'rename' ? tUi("Название чата") : tUi("В какой проект?")}</h2><button type="button" disabled={busy} aria-label={tUi("Закрыть")} onClick={onClose}><X size={18} /></button></header>
      {kind === 'rename' ? <input autoFocus required maxLength={120} aria-label={tUi("Новое название чата")} value={title} onChange={(event) => setTitle(event.target.value)} /> : <>
        <p>{chat.artifactName ? tUi("Вместе с чатом переместится «{p1}» и связанные материалы.", { p1: chat.artifactName }) : tUi("Созданные в чате материалы будут доступны в выбранном проекте, включая новые результаты.")}</p>
        <div className={styles.folders}><button type="button" aria-pressed={folderId === null} onClick={() => setFolderId(null)}><Folder size={18} />{tUi("Вне проекта")}</button>
          {workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id && !folder.systemKey).map((folder) => <button type="button" key={folder.id} aria-pressed={folderId === folder.id} onClick={() => setFolderId(folder.id)}><Folder size={18} />{folder.name}</button>)}
        </div>
      </>}
      {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      <footer><button type="button" disabled={busy} onClick={onClose}>{tUi("Отмена")}</button><button type="submit" disabled={busy || (kind === 'rename' && !title.trim())}>{busy ? tUi("Сохраняем…") : kind === 'rename' ? tUi("Сохранить") : tUi("Переместить")}</button></footer>
    </form>
  </dialog>;
}
