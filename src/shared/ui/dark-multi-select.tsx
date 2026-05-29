'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';
import type { DarkSelectOption } from './dark-select';

interface DarkMultiSelectProps {
  value: string[];
  label: string;
  options: DarkSelectOption[];
  onChange: (value: string[]) => void;
  wide?: boolean;
}

export function DarkMultiSelect({ value, label, options, onChange, wide }: DarkMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = new Set(value);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - Math.max(230, rect.width)),
      width: Math.max(230, rect.width),
    });
    setOpen(true);
  };

  const toggleValue = (nextValue: string) => {
    if (nextValue === 'default') {
      onChange(['default']);
      return;
    }

    const next = new Set(selected);
    next.delete('default');
    if (next.has(nextValue)) next.delete(nextValue);
    else next.add(nextValue);
    onChange(next.size === 0 ? ['default'] : Array.from(next));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn('mini-select', wide && 'mini-select-wide')}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        {label}
        <ChevronDown size={13} />
      </button>
      {open && anchor ? createPortal(
        <>
          <div className="dark-select-backdrop" onClick={() => setOpen(false)} />
          <div
            className="dark-select-menu"
            style={{ top: anchor.top, left: anchor.left, minWidth: anchor.width }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const isSelected = selected.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn('dark-select-item', isSelected && 'dark-select-item-selected')}
                  onClick={() => toggleValue(option.value)}
                >
                  <span>{option.label}</span>
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
