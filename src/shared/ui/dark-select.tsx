'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';

export interface DarkSelectOption {
  value: string;
  label: string;
}

interface DarkSelectProps {
  value: string;
  options: DarkSelectOption[];
  onChange: (value: string) => void;
  wide?: boolean;
}

export function DarkSelect({ value, options, onChange, wide }: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ bottom?: number; left: number; top?: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find((option) => option.value === value);

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
    const menuHeight = Math.min(240, window.innerHeight - 16);
    const openAbove = rect.bottom + menuHeight + 4 > window.innerHeight && rect.top > menuHeight;
    setAnchor({
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(8, rect.right - Math.max(190, rect.width)),
      top: openAbove ? undefined : rect.bottom + 4,
      width: Math.max(190, rect.width),
    });
    setOpen(true);
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
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
      >
        {selected?.label ?? value}
        <ChevronDown size={13} />
      </button>
      {open && anchor ? createPortal(
        <>
          <div className="dark-select-backdrop" onClick={() => setOpen(false)} />
          <div
            className="dark-select-menu"
            style={{ bottom: anchor.bottom, top: anchor.top, left: anchor.left, minWidth: anchor.width }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn('dark-select-item', isSelected && 'dark-select-item-selected')}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
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
