'use client';

import { Check, ChevronDown } from '@prodactionpro/ui-core/icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';

export interface DarkSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface DarkSelectProps {
  value: string;
  options: DarkSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  wide?: boolean;
  ariaLabel?: string;
  caption?: string;
  disabled?: boolean;
  surface?: 'default' | 'liquid';
}

export function DarkSelect({ value, options, onChange, className, wide, ariaLabel, caption, disabled = false, surface = 'default' }: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ bottom?: number; left: number; top?: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const hasDescriptions = options.some((option) => option.description);

  const updateAnchor = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(240, window.innerHeight - 16);
    const menuWidth = Math.min(window.innerWidth - 16, Math.max(hasDescriptions ? 310 : 190, rect.width));
    const openAbove = rect.bottom + menuHeight + 4 > window.innerHeight && rect.top > menuHeight;
    setAnchor({
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(8, rect.right - menuWidth),
      top: openAbove ? undefined : rect.bottom + 4,
      width: menuWidth,
    });
  }, [hasDescriptions]);

  useEffect(() => {
    if (!open || disabled) return;
    const item = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?? menuRef.current?.querySelector<HTMLElement>('[role="option"]');
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, disabled]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open, updateAnchor]);

  const openMenu = () => {
    updateAnchor();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn('mini-select', wide && 'mini-select-wide', className)}
        data-node-interactive
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp'].includes(event.key) || disabled) return;
          event.preventDefault();
          event.stopPropagation();
          openMenu();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
      >
        <span className="dark-select-option-content">
          {selected?.icon}
          <span className={cn('dark-select-option-copy', caption && 'dark-select-option-copy-captioned')}>
            {caption ? <small>{caption}</small> : null}
            <span className="mini-select-label" title={selected?.label ?? value}>{selected?.label ?? value}</span>
          </span>
        </span>
        <ChevronDown size={13} />
      </button>
      {open && anchor && !disabled ? createPortal(
        <>
          <div
            className="dark-select-backdrop"
            data-node-interactive
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(false)}
          />
          <div
            ref={menuRef}
            className={cn('dark-select-menu', surface === 'liquid' && 'home-liquid-menu')}
            data-node-interactive
            role="listbox"
            aria-label={ariaLabel}
            style={{ bottom: anchor.bottom, top: anchor.top, left: anchor.left, minWidth: anchor.width, width: hasDescriptions ? anchor.width : undefined }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Tab') { setOpen(false); triggerRef.current?.focus(); return; }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn('dark-select-item', isSelected && 'dark-select-item-selected')}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <span className="dark-select-option-content">
                    {option.icon}
                    <span className="dark-select-option-copy">
                      <span>{option.label}</span>
                      {option.description ? <small>{option.description}</small> : null}
                    </span>
                  </span>
                  {isSelected ? <Check size={14} /> : null}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
