'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Folder, MoreHorizontal, Pencil } from '@prodactionpro/ui-core/icons';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { ContextMenu } from '@/shared/ui/context-menu';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useWorkspaceShell } from './workspace-shell-context';

export function ProjectFolderCard({ folder, description, previews = [], media = false }: {
  folder: StudioFolder; description: string; previews?: string[]; media?: boolean;
}) {
  const tUi = useTranslations();
  const router = useRouter();
  const menu = useContextMenu();
  const [editing, setEditing] = useState(false);
  const href = `/folders/${folder.id}${media ? '?type=media' : ''}`;
  const actions = [
    { id: 'open', label: tUi("Открыть проект"), onSelect: () => router.push(href) },
    { id: 'rename', label: tUi("Переименовать проект"), icon: <Pencil size={14} />, disabled: Boolean(folder.systemKey), disabledReason: tUi("Имя проекта интеграции задано системой."), onSelect: () => setEditing(true) },
  ];
  return <article className="workspace-project-card story-file-card project-folder-card" onContextMenu={(event) => menu.openContextMenu(event, actions)} onKeyDown={(event) => { if (event.key === 'Escape') menu.closeContextMenu(); }}>
    <div className="workspace-project-preview story-file-preview project-folder-preview">
      <Link href={href} aria-label={tUi("Открыть проект {p1}", { p1: folder.name })} draggable={false}>
        {previews.length ? <span className="project-folder-mosaic" aria-hidden="true">{previews.slice(0, 4).map((src, index) => <img key={`${src}-${index}`} src={src} alt="" loading="lazy" draggable={false} />)}</span> : <img src="/stories/story-atmosphere.webp" alt="" loading="lazy" draggable={false} />}
        <span className="story-file-illustration"><Folder size={38} strokeWidth={1.1} /></span>
        <span className="story-file-kind">Project</span>
      </Link>
      <button type="button" className="story-file-menu" aria-label={tUi("Действия с проектом: {p1}", { p1: folder.name })} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); menu.openContextMenuAt(rect.right - 220, rect.bottom + 6, actions, 220); }}><MoreHorizontal size={18} /></button>
    </div>
    <div className="project-folder-identity">
      {/^(токбери|tokberi|togberry)$/i.test(folder.name.trim()) ? <img src="/workspace-assets/tokberi-logo.svg" alt="" draggable={false} /> : null}
      <div><Link href={href}>{folder.name}</Link><small>{folder.systemKey === 'content-hub' ? tUi("Интеграция Content Hub · ") : ''}{description}</small></div>
    </div>
    <ContextMenu menu={menu.menu} onClose={menu.closeContextMenu} />
    {editing ? <RenameProjectDialog folder={folder} onClose={() => setEditing(false)} /> : null}
  </article>;
}

function RenameProjectDialog({ folder, onClose }: { folder: StudioFolder; onClose: () => void }) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="story-dialog" aria-labelledby={`rename-project-${folder.id}`} onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError('');
      try { await workspace.saveFolder(name.trim(), folder.id); onClose(); }
      catch { setError(tUi("Не удалось переименовать проект. Попробуйте ещё раз.")); }
      finally { setBusy(false); }
    }}><h2 id={`rename-project-${folder.id}`}>{tUi("Имя проекта")}</h2><label className="story-fields">{tUi("Название")}<input autoFocus required maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}<footer><button type="button" disabled={busy} onClick={onClose}>{tUi("Отмена")}</button><button className="story-primary" disabled={busy || !name.trim()}>{tUi("Сохранить")}</button></footer>
    </form>
  </dialog>;
}
