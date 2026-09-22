'use client';

import { useState, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@prodactionpro/ui-core/select';
import { cn } from '@/shared/lib/cn';
import './filter-select.css';

export interface FilterOption { value: string; label: string; count?: number }
const EMPTY = '__filter_empty__';

/** Compact filtering control, shared by page toolbars and dialogs. */
export function FilterSelect({ label, value, options, onChange, defaultValue = '', className, icon, nativeTooltip = true }: {
  label: string; value: string; options: FilterOption[]; onChange: (value: string) => void;
  defaultValue?: string; className?: string; icon?: ReactNode; nativeTooltip?: boolean;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // A selected constraint stays available while asynchronous facets are loading.
  const available = options.some((option) => option.value === value) ? options : [...options, { value, label: value || label }];
  const selected = available.find((option) => option.value === value);
  const title = value === defaultValue ? label : selected?.label ?? label;
  const dialog = trigger?.closest('dialog') ?? undefined;
  return <div className={cn('production-filter-select', className)} data-icon-only={icon ? 'true' : undefined}>
    <Select value={value || EMPTY} onValueChange={(next) => onChange(next === EMPTY ? '' : next)} open={open} onOpenChange={setOpen}>
      <SelectTrigger ref={setTrigger} aria-label={label} title={nativeTooltip ? (icon ? label : `${label}: ${selected?.label ?? title}`) : undefined} data-active={value !== defaultValue}>
        <SelectValue>{icon ?? title}</SelectValue>
      </SelectTrigger>
      <SelectContent className="production-filter-menu" position="popper" sideOffset={6} collisionPadding={12}
        portalContainer={dialog} collisionBoundary={dialog}
        onEscapeKeyDown={(event) => { event.preventDefault(); setOpen(false); }}>
        {available.map((option) => <SelectItem key={option.value || EMPTY} value={option.value || EMPTY} textValue={option.label}>
          <span className="production-filter-option"><span>{option.label}</span>{option.count !== undefined ? <small>{option.count}</small> : null}</span>
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
