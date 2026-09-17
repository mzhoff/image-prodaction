'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import Link from 'next/link';
import { FilePlus2, MoreHorizontal, Star } from '@prodactionpro/ui-core/icons';
import type { MouseEvent } from 'react';
import type { ProjectSummary } from '@/entities/workspace/model/types';

export function WorkspaceFileCard({ project, folderName, editing, name, onName, commit, cancel, menu, favorite }: {
  project: ProjectSummary; editing: boolean; name: string; onName: (name: string) => void;
  folderName?: string;
  commit: () => void; cancel: () => void; menu: (event: MouseEvent) => void; favorite: () => void;
}) {
  return <article className="workspace-project-card" onContextMenu={menu}>
    <div className="workspace-project-preview">
      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
        {project.thumbnailAvailable && project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" />
          : <span className="workspace-project-preview-empty" aria-hidden="true"><FilePlus2 size={22} /><span>Preview will appear after editing</span></span>}
      </Link>
      {project.status === 'active' ? <button type="button" aria-pressed={project.favorite} onClick={favorite}
        className={`workspace-project-star ${project.favorite ? 'workspace-project-star-active' : ''}`}
        aria-label={project.favorite ? 'Remove from favorites' : 'Add to favorites'}><Star size={20} fill={project.favorite ? 'currentColor' : 'none'} /></button> : null}
    </div>
    <div className="workspace-project-title-row">
      {editing ? <PuiInput autoFocus className="workspace-project-title-input" value={name} onBlur={commit}
        onChange={(event) => onName(event.target.value)} onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') cancel(); }} /> : <div className="workspace-project-title-copy">
          <h3>{project.name}</h3>
          {folderName ? <span>{folderName}</span> : null}
        </div>}
      <button className="workspace-project-menu-button" type="button" aria-label={`More actions: ${project.name}`} onClick={menu}><MoreHorizontal size={18} /></button>
    </div>
  </article>;
}
