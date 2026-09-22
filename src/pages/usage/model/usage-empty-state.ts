import type { ProviderKeyBudget } from '@/features/provider-budget/model/use-key-budget';

/** Unknown or failed balance checks must never be presented as an unpaid account. */
export function usageNeedsFunding(balance: ProviderKeyBudget | null, error: boolean) {
  if (error || !balance) return false;
  return balance.status === 'disconnected' || (balance.budget.remaining !== null && balance.budget.remaining <= 0);
}
