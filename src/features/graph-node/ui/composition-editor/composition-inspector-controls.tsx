import type { ReactNode } from 'react';

export function UnitNumberControl({
  ariaLabel,
  className,
  icon,
  max,
  min,
  onChange,
  prefix,
  suffix,
  value,
}: {
  ariaLabel: string;
  className?: string;
  icon?: ReactNode;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  return (
    <label className={['composition-unit-number-control', className].filter(Boolean).join(' ')}>
      {icon ? <span className="composition-unit-number-icon">{icon}</span> : null}
      {prefix ? <span className="composition-unit-number-prefix">{prefix}</span> : null}
      <input
        type="number"
        aria-label={ariaLabel}
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix ? <span className="composition-unit-number-suffix">{suffix}</span> : null}
    </label>
  );
}

export function SegmentedIconControl({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Array<{ icon: ReactNode; label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="composition-segmented-icon-control">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          className={option.value === value ? 'composition-segmented-icon-active' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function LetterSpacingMark() {
  return (
    <span className="composition-letter-spacing-mark" aria-hidden="true">
      <span>A</span>
    </span>
  );
}
