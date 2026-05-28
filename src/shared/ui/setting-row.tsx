'use client';

import { ChevronDown } from 'lucide-react';
import { DarkSelect, type DarkSelectOption } from './dark-select';

interface SettingRowProps {
  label: string;
  value: string;
  options?: DarkSelectOption[];
  onChange?: (value: string) => void;
  wide?: boolean;
}

export function SettingRow({ label, value, options, onChange, wide }: SettingRowProps) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      {options && onChange ? (
        <DarkSelect value={value} options={options} onChange={onChange} wide={wide} />
      ) : (
        <button type="button" className="mini-select">
          {value}
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
}
