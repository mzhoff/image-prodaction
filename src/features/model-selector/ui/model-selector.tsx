'use client';
import { Check, ChevronDown, X } from '@prodactionpro/ui-core/icons';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { cn } from '@/shared/lib/cn';
import { selectModels, MODEL_TABS, type ModelModality, type ModelTab } from '@/shared/model-preferences/contracts';
import { useModelPreferences } from '../model/use-model-preferences';
import { FavoriteButton } from './favorite-button';
import { ImageModelLogo } from './image-model-logo';
import { VideoModelLogo } from './video-model-logo';

export const MODEL_TAB_LABELS: Record<ModelTab, string> = { all: 'All', popular: 'Most popular', favorites: 'Favorite' };
export interface ModelSelectorProps {
  modality: ModelModality; value: string; options: DarkSelectOption[]; onChange: (value: string) => void;
  wide?: boolean; disabled?: boolean; ariaLabel?: string; className?: string;
}
export function ModelSelector({ modality, value, options: rawOptions, onChange, wide, disabled, ariaLabel = 'Model', className }: ModelSelectorProps) {
  const options = rawOptions.map((option) => ({ ...option, icon: option.icon ?? (modality === 'video' ? <VideoModelLogo modelKey={option.value} /> : <ImageModelLogo modelId={option.value} />) }));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number; placement: 'top' | 'bottom' } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const state = useModelPreferences(open);
  const preference = state.data.preferences[modality];
  const items = selectModels(options, preference.tab, preference.favorites, state.data.popularity[modality], query);
  const selected = options.find((option) => option.value === value && value !== 'openrouter/auto');
  const label = selected?.label ?? (value === 'openrouter/auto' ? 'Выберите модель' : value);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  const position = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(351, window.innerWidth - 16);
    const height = Math.min(300, window.innerHeight - 16);
    const placement = rect.bottom + height + 4 <= window.innerHeight - 8 ? 'bottom' : 'top';
    const top = placement === 'bottom' ? rect.bottom + 4 : rect.top - height - 4;
    setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - height - 8)), width, height, placement });
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    search.current?.focus();
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, position, close]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      const buttons = [...popup.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input')].filter((item) => item.tabIndex >= 0);
      const current = buttons.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && current === 0) || (!event.shiftKey && current === buttons.length - 1)) { event.preventDefault(); close(); }
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (event.target === search.current && event.key !== 'ArrowDown') return;
    const choices = [...popup.current!.querySelectorAll<HTMLButtonElement>('[data-model-choice]')];
    if (!choices.length) return;
    event.preventDefault();
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % choices.length : (current - 1 + choices.length) % choices.length;
    choices[index].focus();
  }
  return <>
    <button ref={trigger} type="button" className={cn('mini-select', wide && 'mini-select-wide', className)} data-node-interactive
      aria-label={ariaLabel} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open} disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); if (open) close(); else { position(); setQuery(''); setOpen(true); } }}>
      <span className="dark-select-option-content">{selected?.icon}<span className="mini-select-label" title={label}>{label}</span></span>
      <ChevronDown size={13} />
    </button>
    {open && anchor && !disabled && createPortal(<>
      <div className="dark-select-backdrop" data-node-interactive onPointerDown={(event) => { event.stopPropagation(); close(); }} />
      <div ref={popup} id={id} className="model-selector-menu" data-placement={anchor.placement}
        style={{ top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height }} role="dialog" aria-label={ariaLabel}
        data-node-interactive onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()} onKeyDown={keyboard}>
        <div className="model-selector-tabs" role="tablist" aria-label="Список моделей">
          {MODEL_TABS.map((tab, index) => <button key={tab} type="button" role="tab" id={`${id}-${tab}`} aria-controls={`${id}-list`}
            aria-selected={preference.tab === tab} tabIndex={preference.tab === tab ? 0 : -1} disabled={!state.ready}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault(); const next = MODEL_TABS[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
              state.change({ modality, action: 'tab', tab: next }); document.getElementById(`${id}-${next}`)?.focus();
            }} onClick={() => state.change({ modality, action: 'tab', tab })}>
            {tab === 'favorites' && <span className="model-favorite-icon" aria-hidden="true" />}{MODEL_TAB_LABELS[tab]}
          </button>)}
        </div>
        <div className="model-selector-search">
          <input ref={search} aria-label="Найти модель" placeholder="Найти" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={14} /></button>}
        </div>
        {state.error && <div className="model-selector-message" role="alert">{state.error} <button type="button" onClick={() => void state.reload()}>Повторить</button></div>}
        <div className="model-selector-list" id={`${id}-list`} role="tabpanel" aria-labelledby={`${id}-${preference.tab}`}>
          {/* A list of separate action buttons supports favorites without nesting a button in a listbox option. */}
          <ul aria-label="Модели">
            {items.map((item) => <li key={item.value} className={cn('model-selector-row', item.value === value && 'is-selected')}>
              <button type="button" data-model-choice aria-pressed={item.value === value} title={item.label}
                onClick={() => { onChange(item.value); close(); }}>
                <span className="dark-select-option-content">{item.icon}<span>{item.label}</span></span>
              </button>
              <FavoriteButton label={item.label} favorite={preference.favorites.includes(item.value)} disabled={!state.ready || state.pending}
                onClick={() => state.change({ modality, action: 'favorite', modelId: item.value, favorite: !preference.favorites.includes(item.value) })} />
              <span className="model-selector-check" aria-hidden="true">{item.value === value && <Check size={14} />}</span>
            </li>)}
          </ul>
          {!items.length && <p className="model-selector-empty">{query ? 'Модели не найдены' : !state.ready ? 'Загружаем настройки…'
            : preference.tab === 'favorites' ? 'Добавьте модели в избранное во вкладке All или в настройках аккаунта.'
              : preference.tab === 'popular' ? 'Пока нет успешных запусков доступных здесь моделей.' : 'Нет доступных моделей.'}</p>}
        </div>
      </div>
    </>, document.body)}
  </>;
}
export function ModelSettingRow({ label = 'Model', ...props }: ModelSelectorProps & { label?: string }) {
  return <div className="setting-row"><span>{label}</span><ModelSelector {...props} /></div>;
}
