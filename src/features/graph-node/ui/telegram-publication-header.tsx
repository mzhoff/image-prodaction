'use client';

import { ChevronDown, Ellipsis, Images, Maximize2, PanelsTopLeft, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';

export type PublicationView = 'input' | 'result';

interface PublicationFormatOption {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

const TELEGRAM_FORMAT_OPTIONS: PublicationFormatOption[] = [
  { id: 'telegram-post', label: 'Post', icon: <Send size={14} /> },
  { id: 'telegram-media-album', label: 'Media album', icon: <Images size={14} />, disabled: true },
  { id: 'telegram-story', label: 'Story', icon: <PanelsTopLeft size={14} />, disabled: true },
];

export function TelegramPublicationHeader({
  collapsed,
  title,
  contentUnitId,
  onRename,
  onCollapsedChange,
}: {
  collapsed: boolean;
  title: string;
  contentUnitId: string;
  onRename: (title: string) => void;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(title);
    }
  }, [editingTitle, title]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const commitTitle = () => {
    setEditingTitle(false);
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setDraftTitle(title);
      return;
    }
    if (nextTitle !== title) onRename(nextTitle);
  };

  return (
    <div className="publication-node-header" data-node-drag-handle>
      <span className="publication-platform-icon" aria-hidden="true">
        <TelegramLogoIcon size={14} />
      </span>
      <div className="publication-node-header-main">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="publication-node-channel-name publication-node-channel-name-input"
            value={draftTitle}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftTitle(title);
                setEditingTitle(false);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <span
            className="publication-node-channel-name publication-node-channel-name-editable"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDraftTitle(title);
              setEditingTitle(true);
            }}
          >
            {title}
          </span>
        )}
        <PublicationFormatSelector value={contentUnitId} />
      </div>
      <button
        type="button"
        className="publication-node-header-action"
        aria-label={collapsed ? 'Expand node' : 'Collapse node'}
        onClick={() => onCollapsedChange(!collapsed)}
        data-node-interactive
      >
        <Maximize2 size={16} />
      </button>
      <button
        type="button"
        className="publication-node-header-action"
        aria-label="Node options"
        data-node-interactive
      >
        <Ellipsis size={16} />
      </button>
    </div>
  );
}

export function PublicationTabs({
  activeView,
  onViewChange,
}: {
  activeView: PublicationView;
  onViewChange: (view: PublicationView) => void;
}) {
  return (
    <div className="publication-node-tabs" data-node-interactive>
      <button
        type="button"
        className={activeView === 'input' ? 'publication-node-tab publication-node-tab-active' : 'publication-node-tab'}
        onClick={() => onViewChange('input')}
      >
        Input
      </button>
      <button
        type="button"
        className={activeView === 'result' ? 'publication-node-tab publication-node-tab-active' : 'publication-node-tab'}
        onClick={() => onViewChange('result')}
      >
        Result
      </button>
    </div>
  );
}

function TelegramLogoIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M21.7 3.7 3.2 10.8c-1 .4-1 1.8.1 2.1l4.7 1.5 1.8 5.3c.3.9 1.5 1.1 2.1.4l2.6-2.7 4.8 3.5c.8.6 1.9.1 2.1-.9l3-14.6c.2-1.1-.8-2-1.8-1.7Zm-4.5 4.5-7.8 7.1-.4 3.1-1-3.7 9.2-6.5Z"
      />
    </svg>
  );
}

function PublicationFormatSelector({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const selected = TELEGRAM_FORMAT_OPTIONS.find((option) => option.id === value) ?? TELEGRAM_FORMAT_OPTIONS[0];

  return (
    <div
      className={open ? 'publication-format-menu publication-format-menu-open' : 'publication-format-menu'}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="publication-format-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="publication-format-popover" role="menu">
          {TELEGRAM_FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === selected.id ? 'publication-format-option publication-format-option-active' : 'publication-format-option'}
              disabled={option.disabled}
              role="menuitem"
              onClick={() => {
                if (!option.disabled) setOpen(false);
              }}
            >
              <span className="publication-format-option-icon" aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
