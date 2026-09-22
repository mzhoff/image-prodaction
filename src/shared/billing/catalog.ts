/** Presentation catalog. Actual entitlements are resolved by the platform server. */
export const PRODUCTION_PLANS = [
  { id: 'start', name: 'Start', description: 'Для первых идей и быстрых результатов.', features: ['Создание изображений, видео и Flows', 'Сохранение результатов в библиотеку', 'Публикация рецептов в Community', 'Использование рецептов Community'], export: false, integration: false },
  { id: 'creator', name: 'Creator', description: 'Для регулярной работы и своих коллекций.', features: ['Всё из Start', 'Экспорт Flows для переиспользования', 'Публикация рецептов в Community'], export: true, integration: false },
  { id: 'studio', name: 'Studio', description: 'Для студии и собственных продуктов.', features: ['Всё из Creator', 'Исполняемые Flows в своих сервисах', 'Подключение через API', 'Публикация рецептов в Community'], export: true, integration: true },
] as const;
export type ProductionPlan = typeof PRODUCTION_PLANS[number]['id'];
export const BUDGET_PACKAGES = [10, 25, 50, 100] as const;
export type BudgetAmount = number;
export const BUDGET_MIN = 10, BUDGET_MAX = 200;
export const isBudgetAmount = (amount: number) => Number.isInteger(amount) && amount >= BUDGET_MIN && amount <= BUDGET_MAX;
export interface SubscriptionRequest { workspaceId?: string; tab?: 'plans' | 'budget'; source?: string }

export interface PublicBillingConfig {
  telegramBotUrl: string | null;
  transfer: { recipient: string; bank: string; details: string; purpose: string; rubPerUsd: number } | null;
}

/** Explicit public fields only: never pass a secret-bearing environment to the browser. */
export function parsePublicBillingConfig(input: unknown): PublicBillingConfig {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const username = typeof value.telegramBotUsername === 'string' ? value.telegramBotUsername.replace(/^@/, '') : '';
  const telegramBotUrl = /^(?=.{5,32}$)[a-z][a-z0-9_]*bot$/i.test(username) ? `https://t.me/${username}` : null;
  const t = value.transfer && typeof value.transfer === 'object' ? value.transfer as Record<string, unknown> : {};
  const text = (key: string) => typeof t[key] === 'string' ? t[key].trim().slice(0, 2000) : '';
  const recipient = text('recipient'), bank = text('bank'), details = text('details'), purpose = text('purpose');
  const rate = t.rubPerUsd;
  const validRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 100_000
    && Math.abs(rate * 100 - Math.round(rate * 100)) < 0.000001;
  return { telegramBotUrl, transfer: recipient && bank && details && purpose && validRate
    ? { recipient, bank, details, purpose, rubPerUsd: rate } : null };
}

export function topUpRubles(amount: BudgetAmount, rate: number) {
  if (!isBudgetAmount(amount) || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid top-up quote');
  return Math.round(rate * 100) * amount / 100;
}
