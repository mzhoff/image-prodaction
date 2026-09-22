'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@prodactionpro/ui-core/select';

const EMPTY = '__settings_empty__';

/** The shared Select stays inside the settings focus trap when presented as a dialog. */
export function SettingsSelect({ label, value, options, onChange, disabled, required, className = '' }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean; required?: boolean; className?: string;
}) {
  const tUi = useTranslations();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return <div className={`settings-select ${className}`}>
    <span className="settings-field-label">{label}</span>
    <Select value={value || EMPTY} disabled={disabled} required={required} onValueChange={(next) => onChange(next === EMPTY ? '' : next)}>
      <SelectTrigger ref={setTrigger} aria-label={label} className="settings-select-trigger"><SelectValue placeholder={tUi("Выберите")} /></SelectTrigger>
      <SelectContent className="settings-select-menu" portalContainer={trigger?.closest('.settings-dialog')}
        position="popper" sideOffset={6} collisionPadding={12} onKeyDown={(event) => event.stopPropagation()}>
        {options.map((option) => <SelectItem key={option.value || EMPTY} value={option.value || EMPTY}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
