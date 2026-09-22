import { handleBudgetSummary } from '@/app/api-routes/platform/budget-summary';
export const runtime = 'nodejs';
export const POST = (request: Request) => handleBudgetSummary(request);
