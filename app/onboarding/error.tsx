'use client';
export default function OnboardingError({ reset }: { reset: () => void }) {
  return <main style={{ maxWidth: 520, margin: '15vh auto', padding: 32, borderRadius: 28, background: 'var(--pui-semantic-surface-primary)' }}>
    <h1>Не удалось открыть анкету</h1><p>Ваши сохранённые ответы остаются на месте. Попробуйте загрузить их ещё раз.</p>
    <button type="button" onClick={reset}>Повторить</button>
  </main>;
}
