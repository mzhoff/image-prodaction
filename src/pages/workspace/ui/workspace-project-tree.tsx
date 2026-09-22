'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Plus, Pencil } from '@prodactionpro/ui-core/icons';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { changeChat } from '@/features/chat-assistant/model/use-production-chats';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { PRODUCTION_CHAT_DRAG_TYPE, SidebarChatList } from './sidebar-chat-list';

interface Props { folders: StudioFolder[]; workspaceId?: string; onCreate: (parent: string) => void; onRename: (folder: StudioFolder) => void }
export function WorkspaceProjectTree(props: Props) {
  const { text } = useInterfaceLocale();
  return <nav className="production-project-tree" aria-label={text('Проекты рабочего пространства', 'Workspace projects')}>
    <ul>{props.folders.filter((folder) => !folder.parentId).map((folder) => <ProjectBranch key={folder.id} {...props} folder={folder} ancestors={[]} />)}</ul>
  </nav>;
}
function ProjectBranch({ folder, ancestors, ...props }: Props & { folder: StudioFolder; ancestors: string[] }) {
  const { text } = useInterfaceLocale();
  const [open, setOpen] = useState(false), [dragging, setDragging] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const children = props.folders.filter((child) => child.parentId === folder.id && !ancestors.includes(child.id));
  return <li>
    <div className="production-project-tree-row" data-dropping={dragging} onDragOver={(event) => {
      if (!folder.systemKey && !busy && event.dataTransfer.types.includes(PRODUCTION_CHAT_DRAG_TYPE)) {
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDragging(true);
      }
    }} onDragLeave={() => setDragging(false)} onDrop={async (event) => {
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      if (!props.workspaceId || folder.systemKey || busy) return;
      try {
        const payload = JSON.parse(event.dataTransfer.getData(PRODUCTION_CHAT_DRAG_TYPE));
        if (payload.workspaceId !== props.workspaceId || typeof payload.id !== 'string') return;
        setBusy(true); setError(''); await changeChat(props.workspaceId, payload.id, { action: 'move', folderId: folder.id }); setOpen(true);
      } catch { setError(text('Не удалось переместить чат. Попробуйте ещё раз.', 'Could not move the chat. Please try again.')); }
      finally { setBusy(false); }
    }}>
      <button className="production-project-expand" type="button" aria-label={`${open ? text('Свернуть', 'Collapse') : text('Развернуть', 'Expand')} ${folder.name}`} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
      <Link href={`/folders/${folder.id}`} title={folder.name}><Folder size={15} /><span>{folder.name}</span></Link>
      {!folder.systemKey ? <span className="production-project-tree-actions">
        <button type="button" aria-label={`${text('Новая папка в', 'New folder in')} ${folder.name}`} onClick={() => { setOpen(true); props.onCreate(folder.id); }}><Plus size={14} /></button>
        <button type="button" aria-label={`${text('Переименовать', 'Rename')} ${folder.name}`} onClick={() => props.onRename(folder)}><Pencil size={13} /></button>
      </span> : null}
    </div>
    {error ? <p className="production-navigation-error" role="alert">{error}</p> : null}
    {open ? <div className="production-project-tree-children"><ul>{children.map((child) => <ProjectBranch key={child.id} {...props} folder={child} ancestors={[...ancestors, folder.id]} />)}</ul>
      <SidebarChatList key={`${props.workspaceId}:${folder.id}`} workspaceId={props.workspaceId} folderId={folder.id} />
    </div> : null}
  </li>;
}
