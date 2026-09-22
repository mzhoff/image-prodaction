export interface KeyBudget {
  limit: number | null;
  remaining: number | null;
  spentFromLimit: number | null;
  limitReset: string | null;
  updatedAt: string;
}
