'use client';

import {
  createTextMessage,
  type AssistantMode,
  type ChatContextSelectors,
  type ChatModelOption,
} from '@prodactionpro/chat-domain';
import {
  ChatRuntimeProvider,
  useChatRuntimeActions,
  useChatRuntimeState,
  useCreateChatRuntime,
} from '@prodactionpro/chat-runtime-react';
import { ChatModuleShell, type ChatAppearanceSettings } from '@prodactionpro/chat-ui';
import { useMemo, type ReactNode } from 'react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';

interface ImageProductionChatProps {
  context: ChatContextSelectors;
  workspaceId?: string;
}

export function ImageProductionChat({ context, workspaceId }: ImageProductionChatProps) {
  const { reload, state } = useChatAssistantConfig(workspaceId);
  if (!workspaceId) return <AssistantNotice>Workspace ещё загружается…</AssistantNotice>;
  if (state.phase === 'idle' || state.phase === 'loading') {
    return <AssistantNotice>Проверяю подключение ассистента…</AssistantNotice>;
  }
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel="Повторить">{state.message}</AssistantNotice>;
  }
  if (!state.value.enabled) {
    return (
      <AssistantNotice>
        Ассистент безопасно выключен. Нужна серверная настройка: {state.value.missingSettings.join(', ')}.
      </AssistantNotice>
    );
  }
  return (
    <ConfiguredChat
      key={`${workspaceId}:${state.value.model}`}
      context={context}
      model={state.value.model}
      workspaceId={workspaceId}
    />
  );
}

function ConfiguredChat({ context, model, workspaceId }: {
  context: ChatContextSelectors;
  model: string;
  workspaceId: string;
}) {
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const stableContext = useMemo(() => context, [context]);
  const runtime = useCreateChatRuntime({
    context: stableContext,
    initialState: {
      messages: [createTextMessage({
        content: 'Привет! Я уже подключён к базе знаний Image Production. Спроси, как устроен продукт, какую ноду выбрать или как собрать пайплайн.',
        role: 'assistant',
      })],
      selectedMode: 'knowledge-base',
      selectedModel: model,
    },
    transport,
  });
  return (
    <ChatRuntimeProvider runtime={runtime}>
      <ChatContent model={model} />
    </ChatRuntimeProvider>
  );
}

function ChatContent({ model }: { model: string }) {
  const state = useChatRuntimeState();
  const actions = useChatRuntimeActions();
  const isTyping = ['loading', 'submitting', 'streaming'].includes(state.phase);
  const modelOption: ChatModelOption = {
    id: model,
    label: compactModelLabel(model),
    provider: 'OpenRouter',
    description: 'Фиксированная модель пилота; меняется владельцем на сервере.',
  };

  return (
    <ChatModuleShell
      allModelOptions={[modelOption]}
      allowedModelIdsByMode={createAllowedModels(model)}
      appearance={APPEARANCE}
      chatStyleOptions={CHAT_STYLES}
      className="image-production-chat"
      fontOptions={FONT_OPTIONS}
      iconLibraryOptions={ICON_OPTIONS}
      inputValue={state.inputValue}
      isTyping={isTyping}
      messages={state.messages}
      modeOptions={MODE_OPTIONS}
      modelOptions={[]}
      onAppearanceChange={() => undefined}
      onCancel={actions.cancel}
      onConfirmToolCall={(id) => { void actions.confirmToolCall(id); }}
      onInputChange={actions.setInputValue}
      onModeChange={actions.setMode}
      onModelChange={actions.setModel}
      onRejectToolCall={(id) => { void actions.rejectToolCall(id); }}
      onSubmit={() => { void actions.submit(); }}
      onToggleModelForMode={() => undefined}
      radiusOptions={RADIUS_OPTIONS}
      selectedMode={state.selectedMode}
      selectedModel={state.selectedModel}
      showAppearanceSettings={false}
      showAssistantSettings={false}
      slots={{
        beforeComposer: state.error ? <div className="image-production-chat-error" role="alert">{state.error}</div> : undefined,
      }}
      subtitle="Image Production knowledge"
      surface="side-panel"
      title="AI Assistant"
      toolCalls={state.pendingToolCalls}
      visualProfileOptions={VISUAL_OPTIONS}
      helperText={<span>Read-only · {compactModelLabel(model)}</span>}
    />
  );
}

function AssistantNotice({ action, actionLabel, children }: {
  action?: () => void;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="assistant-chat-notice" role="status">
      <p>{children}</p>
      {action ? <button onClick={action} type="button">{actionLabel}</button> : null}
    </div>
  );
}

function compactModelLabel(model: string) {
  return model.split('/').at(-1) ?? model;
}

function createAllowedModels(model: string): Record<AssistantMode, string[]> {
  return {
    'general-chat': [],
    'knowledge-base': [model],
    'product-copilot': [],
    'mcp-agent': [],
    'image-generation': [],
    'document-assistant': [],
    debug: [],
  };
}

const MODE_OPTIONS = [{
  id: 'knowledge-base' as const,
  label: 'Knowledge',
  description: 'Ответы по утверждённой базе знаний и текущему документу.',
}];
const APPEARANCE: ChatAppearanceSettings = {
  assistantBubble: true,
  chatStyle: 'compact',
  font: 'product',
  iconLibrary: 'lucide',
  radius: 'product',
  showAssistantAvatar: true,
  showUserAvatar: false,
  visualProfile: 'product-light',
};
const CHAT_STYLES = [{ id: 'compact', label: 'Compact', description: 'Product side panel.' }];
const FONT_OPTIONS = [{ id: 'product', label: 'Product', description: 'System UI font.', fontFamily: 'inherit' }];
const ICON_OPTIONS = [{ id: 'lucide', label: 'Lucide', description: 'Product icon set.' }];
const RADIUS_OPTIONS = [{
  id: 'product',
  label: 'Product',
  description: 'Image Production radius.',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px' },
}];
const VISUAL_OPTIONS = [{
  id: 'product-light',
  label: 'Product light',
  description: 'Image Production light theme.',
  colorMode: 'light' as const,
  swatches: ['#ffffff', '#111111', '#f4f4f5'] as const,
}];
