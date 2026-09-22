import type { KeyBudget } from '../contracts/key-budget';

/** The provider's remaining limit is authoritative. Lifetime usage may span several resets. */
export function keyBudget(usage: {
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  updatedAt: string;
}): KeyBudget {
  const limit = finite(usage.limit);
  const remaining = finite(usage.limitRemaining);
  return {
    limit, remaining,
    spentFromLimit: limit !== null && remaining !== null ? Number(Math.max(0, limit - remaining).toFixed(8)) : null,
    limitReset: usage.limitReset,
    updatedAt: usage.updatedAt,
  };
}

function finite(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
