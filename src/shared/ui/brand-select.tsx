'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';

export interface BrandSelectOption {
  value: string;
  label: string;
  description?: string;
  count?: number;
}

interface BrandSelectProps {
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: BrandSelectOption[];
  placeholder?: string;
  value: string;
}

export function BrandSelect({
  className,
  disabled,
  label,
  onChange,
  options,
  placeholder = 'Выберите',
  value,
}: BrandSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function openMenu() {
    if (disabled || options.length === 0) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function selectAt(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAt(activeIndex);
    }
  }

  return (
    <div
      className={cn('brand-select', open && 'brand-select-open', className)}
      ref={rootRef}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="brand-select-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>
          <small>{label}</small>
          <strong>{selected?.label ?? placeholder}</strong>
        </span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="brand-select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const selectedOption = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={cn(
                  'brand-select-option',
                  index === activeIndex && 'brand-select-option-active',
                  selectedOption && 'brand-select-option-selected',
                )}
                key={option.value || '__all__'}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => selectAt(index)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {typeof option.count === 'number' ? <em>{option.count}</em> : null}
                {selectedOption ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
