import type { ToolCallRecord } from '@prodactionpro/chat-domain';
import type { ChatRuntime } from '@prodactionpro/chat-runtime-core';

type Runtime = Pick<ChatRuntime, 'getSnapshot' | 'confirmToolCall' | 'rejectToolCall' | 'loadConversation' | 'setMode'>;
export interface HomeSubmitAuthorizationState {
  pendingToolId?: string;
  error?: string;
  retryToolId?: string;
}

export function isSubmitAuthorizedHomeTool(tool: ToolCallRecord) {
  return tool.toolName === 'home_generate_image' && tool.riskLevel === 'write'
    && tool.presentationType === 'image-production.home-generation' && tool.safePreview?.submitAuthorized === true;
}

/** Consumes only the user's server-pinned Create/Enter authorization through the public signed tool API. */
export class HomeSubmitAuthorizationController {
  private readonly runtime: Runtime;
  private readonly onConfirmed?: (tool: ToolCallRecord) => void;
  private readonly attempted = new Set<string>();
  private readonly cancelRequested = new Set<string>();
  private readonly canceledTurns = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private state: HomeSubmitAuthorizationState = {};
  private active = false;
  constructor(runtime: Runtime, onConfirmed?: (tool: ToolCallRecord) => void) {
    this.runtime = runtime; this.onConfirmed = onConfirmed;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  async runPending() {
    const current = this.runtime.getSnapshot();
    if (this.active || !['idle', 'error'].includes(current.phase)) return;
    if (this.state.retryToolId && current.pendingToolCalls.some((tool) => tool.id === this.state.retryToolId && tool.status === 'completed')) {
      this.setState({});
    }
    const tool = current.pendingToolCalls.find((candidate) => candidate.conversationId === current.conversationId
      && candidate.status === 'needs-confirmation' && isSubmitAuthorizedHomeTool(candidate) && !this.attempted.has(candidate.id));
    if (tool) {
      if (tool.turnId && this.canceledTurns.has(tool.turnId)) await this.reject(tool.id);
      else await this.confirm(tool.id);
    }
  }

  async cancelPending() {
    const current = this.runtime.getSnapshot();
    if (current.activity?.turnId) this.canceledTurns.add(current.activity.turnId);
    const pending = current.pendingToolCalls.filter((tool) => tool.conversationId === current.conversationId
      && tool.status === 'needs-confirmation' && isSubmitAuthorizedHomeTool(tool)
      && !(this.active && tool.id === this.state.pendingToolId));
    // Mark synchronously before runtime.cancel() settles the streaming phase.
    pending.forEach((tool) => { this.attempted.add(tool.id); this.cancelRequested.add(tool.id);
      if (tool.turnId) this.canceledTurns.add(tool.turnId); });
    for (const tool of pending) await this.reject(tool.id);
  }

  async retry() {
    const toolId = this.state.retryToolId;
    const before = this.runtime.getSnapshot();
    if (this.active || !toolId || !before.conversationId || !['idle', 'error'].includes(before.phase)) return;
    this.active = true;
    this.setState({ pendingToolId: toolId });
    try {
      // A lost response may already have started the job. Refresh before retrying the same signed tool.
      await this.runtime.loadConversation(before.conversationId);
      this.runtime.setMode(before.selectedMode);
      const current = this.runtime.getSnapshot();
      const tool = current.pendingToolCalls.find((candidate) => candidate.id === toolId);
      if (!tool || !isSubmitAuthorizedHomeTool(tool)) {
        this.setState({ error: 'Запрос недоступен. Обновите страницу, чтобы восстановить его состояние.' });
      } else if (tool.status === 'completed' || (this.cancelRequested.has(toolId) && ['rejected', 'cancelled', 'expired'].includes(tool.status))) {
        this.setState({});
      } else if (tool.status === 'needs-confirmation' && ['idle', 'error'].includes(current.phase)) {
        this.active = false;
        if (this.cancelRequested.has(toolId)) await this.reject(toolId);
        else await this.confirm(toolId);
      } else if (tool.status === 'running' || !['idle', 'error'].includes(current.phase)) {
        this.setState({ error: 'Запрос ещё обрабатывается. Проверьте его состояние через несколько секунд.', retryToolId: toolId });
      } else {
        this.setState({ error: terminalMessage(tool) });
      }
    } catch {
      this.setState({ error: connectionMessage, retryToolId: toolId });
    } finally { this.active = false; }
  }

  private async reject(toolId: string) {
    this.active = true;
    this.cancelRequested.add(toolId);
    this.attempted.add(toolId);
    this.setState({ pendingToolId: toolId });
    try {
      await this.runtime.rejectToolCall(toolId, 'Генерация остановлена пользователем до запуска.');
      this.setState({});
    } catch {
      this.setState({ error: 'Не удалось подтвердить остановку. Проверьте соединение и повторите проверку.', retryToolId: toolId });
    } finally { this.active = false; }
  }

  private async confirm(toolId: string) {
    this.active = true;
    this.attempted.add(toolId);
    this.setState({ pendingToolId: toolId });
    try {
      const result = await this.runtime.confirmToolCall(toolId);
      this.setState(result.status === 'completed' ? {} : { error: terminalMessage(result) });
      if (result.status === 'completed') {
        try { this.onConfirmed?.(result); } catch { /* Analytics must not turn a successful execution into a retry. */ }
      }
    } catch {
      // No automatic retry loop: a visible retry reconciles the same operation first.
      this.setState({ error: connectionMessage, retryToolId: toolId });
    } finally { this.active = false; }
  }

  private setState(state: HomeSubmitAuthorizationState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

const connectionMessage = 'Не удалось получить состояние запуска. Проверьте соединение и повторите проверку — новое изображение не создастся.';
function terminalMessage(tool: ToolCallRecord) {
  if (tool.status === 'expired') return 'Запрос устарел. Проверьте описание и отправьте его заново.';
  return tool.errorMessage && /[а-яё]/i.test(tool.errorMessage) ? tool.errorMessage
    : 'Не удалось запустить генерацию. Проверьте состояние запроса перед повторной отправкой.';
}
