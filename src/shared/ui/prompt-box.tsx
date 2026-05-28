'use client';

interface PromptBoxProps {
  value?: string;
  readonly?: boolean;
  onChange?: (value: string) => void;
}

export function PromptBox({ value, readonly, onChange }: PromptBoxProps) {
  if (readonly) {
    return <div className="prompt-box prompt-box-readonly">{value}</div>;
  }

  return (
    <textarea
      className="prompt-box"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder="Добавьте промпт или ограничение"
    />
  );
}
