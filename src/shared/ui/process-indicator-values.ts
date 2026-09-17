export function formatRemainingTime(milliseconds?: number | null): string | undefined {
  if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `Осталось примерно ${seconds} с`;
  return `Осталось примерно ${Math.ceil(seconds / 60)} мин`;
}

export function estimateRemainingTime(elapsedMs: number | undefined, completed: number, total: number): number | undefined {
  if (elapsedMs == null || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || completed <= 0 || total <= completed) return undefined;
  return elapsedMs / completed * (total - completed);
}
