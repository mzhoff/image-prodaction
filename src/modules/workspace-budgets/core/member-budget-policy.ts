import type { MemberBudgetPolicy } from '../contracts/member-budget';
export class MemberBudgetError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 403) {
    super(message);
    this.name = 'MemberBudgetError';
    this.code = code;
    this.status = status;
  }
}
export function usdUnits(value: string) {
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(value))
    throw new MemberBudgetError('invalid_budget', 'Некорректная сумма лимита.', 400);
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * BigInt(100000000) + BigInt(decimal.padEnd(8, '0'));
}
export function checkMemberBudget(
  policy: Pick<MemberBudgetPolicy, 'enabled' | 'limitUsd' | 'mode'>,
  spent: string,
  unresolved: number,
) {
  if (!policy.enabled)
    throw new MemberBudgetError(
      'member_ai_disabled',
      'Владелец отключил AI-запуски для вашего участия в этом Workspace.',
    );
  if (policy.limitUsd === null) return;
  if (usdUnits(spent) >= usdUnits(policy.limitUsd))
    throw new MemberBudgetError(
      'member_budget_exhausted',
      'Личный лимит расходов Workspace исчерпан. Обратитесь к владельцу.',
      402,
    );
  if (unresolved > 0)
    throw new MemberBudgetError(
      'member_usage_pending',
      'Стоимость предыдущего запроса ещё уточняется. Новый платный запуск пока недоступен.',
      409,
    );
  if (policy.mode === 'strict')
    throw new MemberBudgetError(
      'member_cost_bound_unavailable',
      'Провайдер не гарантирует цену запроса заранее. Строгий личный лимит не разрешает этот запуск.',
      409,
    );
}
