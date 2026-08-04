'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Menu, Pencil, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContextMenu } from '@/shared/ui/context-menu';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useContextMenu } from '@/shared/ui/use-context-menu';

interface DocumentTitleBarProps {
  favorite: boolean;
  onCloseCanvasMenu: () => void;
  onExportProject: () => void;
  onMoveToTrash: () => Promise<unknown>;
  onNotify: (message: string) => void;
  onRename: (name: string) => Promise<{ name: string }>;
  onToggleFavorite: (favorite: boolean) => Promise<unknown>;
  title: string;
}

export function DocumentTitleBar({
  favorite,
  onCloseCanvasMenu,
  onExportProject,
  onMoveToTrash,
  onNotify,
  onRename,
  onToggleFavorite,
  title,
}: DocumentTitleBarProps) {
  const router = useRouter();
  const menu = useContextMenu();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftTitle, setDraftTitle] = useState(title);

  useEffect(() => setDraftTitle(title), [title]);

  const focusTitle = () => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commitTitle = async () => {
    const normalized = draftTitle.trim();
    if (!normalized || normalized === title) {
      setDraftTitle(title);
      return;
    }
    try {
      const project = await onRename(normalized);
      setDraftTitle(project.name);
      onNotify('Pipeline renamed.');
    } catch (error) {
      setDraftTitle(title);
      onNotify(error instanceof Error ? error.message : 'Could not rename pipeline.');
    }
  };

  const actions: ContextMenuAction[] = [
    {
      id: 'rename-document',
      label: 'Rename pipeline',
      icon: <Pencil size={14} />,
      onSelect: focusTitle,
    },
    {
      id: 'favorite-document',
      label: favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: <Star size={14} fill={favorite ? 'currentColor' : 'none'} />,
      onSelect: () => {
        void onToggleFavorite(!favorite).catch((error) => {
          onNotify(error instanceof Error ? error.message : 'Could not update favorites.');
        });
      },
    },
    {
      id: 'export-document',
      label: 'Export project',
      icon: <Download size={14} />,
      separatorBefore: true,
      onSelect: onExportProject,
    },
    {
      id: 'trash-document',
      label: 'Move to trash',
      icon: <Trash2 size={14} />,
      destructive: true,
      separatorBefore: true,
      onSelect: () => {
        if (!window.confirm(`Move “${title}” to trash?`)) return;
        void onMoveToTrash()
          .then(() => router.push('/'))
          .catch((error) => onNotify(
            error instanceof Error ? error.message : 'Could not move pipeline to trash.',
          ));
      },
    },
  ];

  return (
    <div className="document-title-pill" data-canvas-ui>
      <Link className="document-title-back" href="/" aria-label="Back to My Files" title="Back to My Files">
        <ArrowLeft size={16} />
      </Link>
      <button
        type="button"
        aria-label="Open document menu"
        onClick={(event) => {
          onCloseCanvasMenu();
          const rect = event.currentTarget.getBoundingClientRect();
          menu.openContextMenuAt(rect.left, rect.bottom + 5, actions, 224);
        }}
      >
        <Menu size={16} />
      </button>
      <input
        ref={inputRef}
        aria-label="Pipeline name"
        value={draftTitle}
        onChange={(event) => setDraftTitle(event.target.value)}
        onBlur={() => void commitTitle()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraftTitle(title);
            event.currentTarget.blur();
          }
        }}
      />
      <ContextMenu menu={menu.menu} onClose={menu.closeContextMenu} />
    </div>
  );
}
