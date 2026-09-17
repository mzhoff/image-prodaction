'use client';

import { ChevronDown } from '@prodactionpro/ui-core/icons';
import { DarkSelect, type DarkSelectOption } from './dark-select';

interface SettingRowProps {
  label: string;
  value: string;
  options?: DarkSelectOption[];
  onChange?: (value: string) => void;
  wide?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function SettingRow({ label, value, options, onChange, wide, disabled, ariaLabel }: SettingRowProps) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      {options && onChange ? (
        <DarkSelect value={value} options={options} onChange={onChange} wide={wide} disabled={disabled} ariaLabel={ariaLabel} />
      ) : (
        <button type="button" className="mini-select" disabled={disabled} aria-label={ariaLabel}>
          {value}
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
}
