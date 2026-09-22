'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Check, ChevronDown, Copy, Download, FolderInput, MoreHorizontal, Trash2, X } from '@prodactionpro/ui-core/icons';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createLibraryImageLink, createLibraryProjectBatchLink } from '@/entities/production-graph/lib/library-image-reference';
import { createUuidV7 } from '@/shared/lib/id';
import { ContextMenu } from '@/shared/ui/context-menu';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import type { LibraryAssetItem } from '../model/types';
import { LibraryProjectMenu, LIBRARY_PROJECT_MENU_ID, type ProjectMenuAnchor } from './library-project-menu';
import { useLibrarySelection } from '../model/use-library-selection';
import { useLibraryFileOperations } from '../model/use-library-file-operations';
import { libraryActionTargets } from '../lib/library-batch-actions';
import { LibraryDeleteDialog } from './library-delete-dialog';

interface Actions {
  copy: (item: LibraryAssetItem) => void;
  download: (items: LibraryAssetItem[]) => Promise<void>;
  send: (item: LibraryAssetItem, anchor: ProjectMenuAnchor) => void;
  projectMenuAssetId: string | null;
  openMenu: (event: MouseEvent, item: LibraryAssetItem) => void;
  openSelectionMenu: (event: MouseEvent) => void;
  selection: ReturnType<typeof useLibrarySelection>;
  busy: boolean;
}
const ActionsContext = createContext<Actions | null>(null);

export function LibraryAssetActionsProvider({ children, items, scope, onDeleted }: {
  children: ReactNode; items: LibraryAssetItem[]; scope: string; onDeleted: (ids: string[]) => void;
}) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell();
  const refreshProjects = workspace.refresh;
  const router = useRouter();
  const pathname = usePathname();
  const [projectSelection, setProjectSelection] = useState<{ items: LibraryAssetItem[]; anchor: ProjectMenuAnchor; pathname: string | null; scope: string } | null>(null);
  const selected = projectSelection?.pathname === pathname && projectSelection.scope === scope ? projectSelection : null;
  const selection = useLibrarySelection(items, scope);
  const [pendingDelete, setPendingDelete] = useState<LibraryAssetItem[] | null>(null);
  const [message, setMessage] = useState('');
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const removeFromSelection = selection.remove;
  const forgetDeleted = useCallback((ids: string[]) => { removeFromSelection(ids); onDeleted(ids); }, [removeFromSelection, onDeleted]);
  const operations = useLibraryFileOperations(scope, setMessage, forgetDeleted);
  useEffect(() => { setProjectSelection(null); setPendingDelete(null); closeContextMenu(); setMessage(''); }, [pathname, scope, closeContextMenu]);

  useEffect(() => {
    if (!message || operations.busy) return;
    const timeout = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [message, operations.busy]);

  const copy = useCallback((item: LibraryAssetItem) => {
    if (!navigator.clipboard?.writeText) {
      setMessage(tUi("Браузер не разрешает буфер обмена. Используйте «Отправить в проект»."));
      return;
    }
    void navigator.clipboard.writeText(createLibraryImageLink(item.id, window.location.origin))
      .then(() => setMessage(tUi("Ссылка скопирована. Откройте канвас и нажмите Ctrl+V или ⌘V.")))
      .catch(() => setMessage(tUi("Не удалось скопировать. Разрешите доступ к буферу или выберите «Отправить в проект».")));
  }, [tUi]);
  const sendItems = useCallback((targets: LibraryAssetItem[], anchor: ProjectMenuAnchor) => {
    setProjectSelection((current) => current?.anchor === anchor && current.pathname === pathname && current.scope === scope
      && current.items.length === targets.length && current.items.every((item, index) => item.id === targets[index].id)
      ? null : { items: targets, anchor, pathname, scope });
    void refreshProjects();
  }, [pathname, scope, refreshProjects]);
  const send = useCallback((item: LibraryAssetItem, anchor: ProjectMenuAnchor) => sendItems([item], anchor), [sendItems]);
  const openTargetsMenu = useCallback((event: MouseEvent, targets: LibraryAssetItem[], allowSelect: boolean) => {
    if (!targets.length || targets.some((item) => item.workspaceId !== workspace.activeWorkspace?.id)) return;
    setProjectSelection(null);
    const anchor = { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY };
    const imagesOnly = targets.every((item) => item.mediaKind === 'image');
    openContextMenu(event, [
      { id: 'copy-image-reference', label: tUi("Скопировать ссылку"), icon: <Copy size={15} />, disabled: targets.length !== 1 || !imagesOnly || operations.busy,
        disabledReason: targets.length > 1 ? tUi("Скопировать ссылку можно только для одного изображения.") : !imagesOnly ? tUi("Доступно только для изображений.") : undefined,
        onSelect: () => copy(targets[0]) },
      { id: 'send-image-project', label: tUi("Добавить в проект"), icon: <FolderInput size={15} />, disabled: !imagesOnly || operations.busy || targets.length > 100,
        disabledReason: !imagesOnly ? tUi("В проект можно добавить только изображения.") : targets.length > 100 ? tUi("За один раз можно добавить до 100 изображений.") : undefined,
        onSelect: () => sendItems(targets, anchor) },
      { id: 'download-library-assets', label: tUi("Скачать"), icon: <Download size={15} />, disabled: operations.busy, onSelect: () => void operations.download(targets) },
      ...(allowSelect ? [{ id: 'select-library-assets', label: tUi("Выбрать"), icon: <Check size={15} />, disabled: operations.busy, onSelect: () => selection.start(targets[0]) }] : []),
      { id: 'delete-library-assets', label: tUi("Удалить"), icon: <Trash2 size={15} />, destructive: true, separatorBefore: true, disabled: operations.busy,
        onSelect: () => setPendingDelete(targets) },
    ], 250);
  }, [tUi, copy, openContextMenu, operations, selection, sendItems, workspace.activeWorkspace?.id]);
  const openMenu = useCallback((event: MouseEvent, item: LibraryAssetItem) => {
    const targets = libraryActionTargets(items, selection.selectedIds, item);
    if (selection.active && !selection.selectedIds.has(item.id)) selection.start(item);
    openTargetsMenu(event, targets, !selection.active);
  }, [items, selection, openTargetsMenu]);
  const openSelectionMenu = useCallback((event: MouseEvent) => openTargetsMenu(event, selection.selected, false), [selection.selected, openTargetsMenu]);
  const projectMenuAssetId = selected?.items[0]?.id ?? null;
  const value = useMemo(() => ({ copy, download: operations.download, send, openMenu, projectMenuAssetId, selection, openSelectionMenu, busy: operations.busy }), [copy, operations.download, send, openMenu, projectMenuAssetId, selection, openSelectionMenu, operations.busy]);

  return <ActionsContext.Provider value={value}>
    {children}
    <ContextMenu menu={menu} onClose={closeContextMenu} />
    {message ? <div className="library-action-message" role="status">{message}</div> : null}
    {pendingDelete ? <LibraryDeleteDialog items={pendingDelete} busy={operations.busy} onCancel={() => setPendingDelete(null)}
      onConfirm={() => { void operations.remove(pendingDelete).then(() => setPendingDelete(null)); }} /> : null}
    {selected ? <LibraryProjectMenu anchor={selected.anchor} workspaceId={selected.items[0].workspaceId} onClose={() => setProjectSelection(null)}
      onSelect={(projectId) => {
        const href = createLibraryProjectBatchLink(projectId, selected.items.map((item) => item.id), createUuidV7());
        setProjectSelection(null);
        selection.clear();
        router.push(href);
      }} /> : null}
  </ActionsContext.Provider>;
}

export function LibrarySelectionToolbar() {
  const tUi = useTranslations();
  const { selection, busy, openSelectionMenu } = useLibraryAssetActions();
  if (!selection.active) return null;
  return <div className="library-selection-toolbar" role="group" aria-label={tUi("Выбор файлов")}>
    <strong role="status">{tUi("Выбрано:")}{' '} {selection.selected.length}</strong>
    <button type="button" disabled={busy} onClick={selection.selectAll}>{tUi("Выбрать все загруженные")}</button>
    <button type="button" disabled={busy || !selection.selected.length} onClick={openSelectionMenu}><MoreHorizontal size={16} />{tUi("Действия")}</button>
    <button type="button" disabled={busy} onClick={selection.clear}><X size={16} />{tUi("Готово")}</button>
  </div>;
}

export function useLibraryAssetActions() {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('Library actions require LibraryAssetActionsProvider.');
  return actions;
}

export function LibraryImageToolbar({ item }: { item: LibraryAssetItem }) {
  const tUi = useTranslations();
  const actions = useLibraryAssetActions();
  return <div className="library-image-actions" role="group" aria-label={tUi("Действия с изображением")}>
    <button type="button" className="image-editor-button" disabled={actions.busy}
      onClick={() => void actions.download([item])}><Download size={17} />{tUi("Скачать")}</button>
    <button type="button" className="image-editor-button" onClick={() => actions.copy(item)}
      title={tUi("Скопировать ссылку для вставки изображения на канвас")}><Copy size={17} />{tUi("Скопировать ссылку")}</button>
    <button type="button" className="image-editor-button" aria-haspopup="menu" aria-expanded={actions.projectMenuAssetId === item.id}
      aria-controls={actions.projectMenuAssetId === item.id ? LIBRARY_PROJECT_MENU_ID : undefined}
      onClick={(event) => actions.send(item, event.currentTarget)}><FolderInput size={17} />{tUi("Отправить в проект")}<ChevronDown size={14} /></button>
  </div>;
}
