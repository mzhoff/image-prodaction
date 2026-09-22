/** Safe product copy shared by Studio and Ask AI. Never display provider bodies or credentials. */
export const AI_BUDGET_NOT_ACTIVATED = 'AI-бюджет этого пространства ещё не активирован. Владелец пространства может запросить активацию у администратора бета-теста в Telegram. Генерации и Ask AI используют общий баланс пространства.';

export const AI_BUDGET_PAYMENT_REQUIRED = 'AI-сервису не хватает доступного бюджета для запроса. Владельцу пространства нужно связаться с администратором бета-теста: он проверит лимит пространства и общий резерв сервиса. Повторный запуск сейчас не поможет.';

export const AI_CONNECTION_UNAVAILABLE = 'AI-подключение пространства недоступно. Владельцу пространства нужно обратиться к администратору бета-теста для проверки доступа. Это не означает, что баланс равен нулю.';

export function aiAccessErrorMessage(code?: string): string | undefined {
  switch (code) {
    case 'provider_not_configured':
    case 'CHAT_WORKSPACE_PROVIDER_REQUIRED':
      return AI_BUDGET_NOT_ACTIVATED;
    case 'payment_required':
    case 'CHAT_WORKSPACE_BUDGET_REQUIRED':
      return AI_BUDGET_PAYMENT_REQUIRED;
    case 'invalid_credential':
    case 'provider_connection_unavailable':
    case 'CHAT_WORKSPACE_PROVIDER_UNAVAILABLE':
      return AI_CONNECTION_UNAVAILABLE;
    case 'member_budget_exhausted':
    case 'CHAT_MEMBER_BUDGET_EXHAUSTED':
      return 'Ваш личный лимит в этом пространстве исчерпан. Обратитесь к владельцу пространства, чтобы он увеличил лимит. Общий баланс пространства может ещё оставаться.';
    case 'member_ai_disabled':
    case 'CHAT_MEMBER_AI_DISABLED':
      return 'Владелец пространства отключил для вас AI-запуски. Попросите его открыть доступ к генерациям и Ask AI.';
    default:
      return undefined;
  }
}
