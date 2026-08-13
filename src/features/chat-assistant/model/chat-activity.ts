import type { ToolLifecycleEvent } from '@prodactionpro/chat-domain';

export function describeToolActivity(event: ToolLifecycleEvent) {
  if (event.status === 'failed') return 'Инструмент вернул ошибку — проверяю результат';
  if (event.status === 'succeeded') return 'Инструмент завершён — анализирую результат';
  if (!['proposed', 'running'].includes(event.status)) return undefined;
  if (event.toolName === 'knowledge_search') return 'Ищу информацию в базе знаний';
  if (event.toolName === 'node_catalog') return 'Читаю каталог нод и портов';
  if (event.toolName === 'pipeline_build') return 'Проверяю структуру и расположение нод';
  return 'Выполняю инструмент ассистента';
}

export function formatChatElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function normalizeChatActivityLabel(statusLabel?: string) {
  if (!statusLabel || statusLabel === 'Отправляю запрос') return 'Анализирую запрос';
  return statusLabel;
}
