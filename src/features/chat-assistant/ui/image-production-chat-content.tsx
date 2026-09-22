'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAssistantAttachmentTarget } from '@/shared/assistant/model/assistant-attachment-target';
import { useAssistantAnswer } from '@/shared/assistant/model/use-assistant-answer';
import { readAssistantAnswer } from '@/shared/assistant/model/assistant-question';
import { presentAssistantQuestions, presentAssistantQuestionTools } from '../model/assistant-questions';

import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';
import { isWorkspaceAiAccessError } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';

import type { ChatAttachment, ChatMessage, ChatModelOption } from '@prodactionpro/chat-domain';
import { ManagedAttachmentPreview, useChatRuntime, useChatRuntimeActions, useChatRuntimeState, type ChatAttachmentDropTarget } from '@prodactionpro/chat-runtime-react';
import { isStandardRetryAllowed } from '@prodactionpro/chat-ui';
import { AssistantChat } from '@/shared/assistant/ui/assistant-chat';
import { SCROLL_POLICY } from '@/shared/assistant/ui/assistant-chat-presentation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import { homeTextSettingsSelector, type HomeTextSettings } from '@/modules/chat-assistant/contracts/home-text-settings';
import { HomeTextSettingsControls } from './home-text-settings-controls';
import { useRouter } from 'next/navigation';
import type { ConversationIntent } from '@/modules/chat-assistant/adapters/client/conversation-start';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useDocumentConversationBinding } from '../model/use-document-conversation-binding';
import { presentStoryTools } from '../model/story-interactions';
import { prepareChatMessagesForPresentation } from '../model/chat-message-presentation';
import { getDocumentActivityActionNode, mergeDocumentActivityMessages } from '../model/document-activity-messages';
import { useDocumentActivity } from '../model/use-document-activity';
import { useRegisterHostedChatLauncher } from '../model/chat-launcher-host';
import { AssistantNotice, compactModelLabel } from './chat-attachment-presentation';
import { renderImageProductionChatError } from './image-production-chat-error';
import { trackBehavior } from '@/shared/analytics/client';
import { HomeChatControls } from './home-chat-controls';
import { createHomeToolRenderers, HOME_MODES } from './home-chat-options';
import type { HomeJobSummary } from '../model/use-home-conversation';
import { HomeGenerationResult } from './home-generation-card';
import { StoryChatComposer } from './story-chat-composer';
import { ProductionTextComposer } from './production-text-composer';
import { STORY_TOOL_RENDERERS } from './story-chat-tools';
import { STORY_QUESTION_TOOL, STORY_WRITING_TOOLS } from '@/modules/chat-assistant/contracts/story-authoring';
import { HomeComposerModeSwitch, type HomeComposerMode } from './home-composer-mode-switch';
import { HomeComposer } from './home-composer';
import { DEFAULT_HOME_VIDEO_SELECTION } from '../model/home-video-selection';
import { DEFAULT_VIDEO_CAMERA, type VideoCameraSettings } from '@/shared/media/home-video-intent';
import type { VideoSlotBindings } from '../model/home-video-materials';
import { useHomeVideoSubmit } from '../model/use-home-video-submit';
import { DEFAULT_HOME_IMAGE_SELECTION } from '../model/home-image-selection';
import { useHomeImageSubmit } from '../model/use-home-image-submit';
import { useHomeMessageSubjects } from '../model/use-home-message-subjects';
import { HomeMessageSubjectPreview } from './home-message-subject-preview';
import { useHomeSubmitAuthorization } from '../model/use-home-submit-authorization';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import { useChatListInvalidation } from '../model/use-chat-list-invalidation';
import { useProductionAttachments } from '../model/use-production-attachments';
import {
  createAllowedModels,
  MODE_OPTIONS,
  TOOL_CALL_PRESENTATION,
  TOOL_RENDERER_REGISTRY,
} from './image-production-chat-options';


const EMPTY_CHAT_WELCOME: ChatMessage = {
  id: 'image-production-welcome:ru:v2',
  role: 'assistant',
  createdAt: new Date().toISOString(),
  blocks: [{
    type: 'markdown',
    content: 'Расскажи, что хочешь создать. Я быстро подготовлю рабочий черновик пайплайна; перед изменением холста ты увидишь одно подтверждение.',
  }],
  metadata: { animate: false },
};

export function ChatContent({ documentId, model, onFocusNode, registerAttachmentDropTarget, workspaceId, home, story, timeline }: {
  timeline?: { welcome: ReactNode; notice: ReactNode };
  story?: { welcome: ReactNode; notice: ReactNode; fullscreen?: boolean; subjects?: HomeSubjectChoice[]; onSubjectsChange?: (subjects: HomeSubjectChoice[]) => void; saving?: boolean };
  documentId?: string;
  model: string;
  onFocusNode?: (nodeId: string) => void;
  registerAttachmentDropTarget?: (target?: ChatAttachmentDropTarget) => void;
  workspaceId: string;
  home?: { ensureConversation: (intent: ConversationIntent) => Promise<string>; welcome: ReactNode; onNew: () => void; jobs: HomeJobSummary[]; screen?: HomeComposerMode;
    composerMode: HomeComposerMode; onComposerModeChange: (mode: HomeComposerMode) => void };
}) {
  const tUi = useTranslations();
  const ui_EMPTY_CHAT_WELCOME = useMemo(() => ({ ...EMPTY_CHAT_WELCOME, blocks: EMPTY_CHAT_WELCOME.blocks.map((block) => block.type === 'markdown' ? { ...block, content: tUi(block.content) } : block) }), [tUi]);
  const ui_HOME_MODES = useUiCatalog(HOME_MODES, tUi);
  const ui_MODE_OPTIONS = useUiCatalog(MODE_OPTIONS, tUi);
  const router = useRouter();
  const runtime = useChatRuntime();
  const accessGate = useAiAccessGate();
  const questionAnswer = useAssistantAnswer(accessGate);
  const state = useChatRuntimeState();
  useChatListInvalidation(state.phase, workspaceId);
  useEffect(() => { if (state.errorDetails) accessGate.onError(state.errorDetails); }, [state.errorDetails, accessGate]);
  const submitAuthorization = useHomeSubmitAuthorization(Boolean(home));
  const [imageDraft, setImageDraft] = useState(DEFAULT_HOME_IMAGE_SELECTION);
  const [videoDraft, setVideoDraft] = useState(DEFAULT_HOME_VIDEO_SELECTION);
  const [videoCamera, setVideoCamera] = useState<VideoCameraSettings>(DEFAULT_VIDEO_CAMERA);
  const [videoSlots, setVideoSlots] = useState<VideoSlotBindings>({});
  const [subjects, setSubjects] = useState<HomeSubjectChoice[]>([]);
  const [textSettings, setTextSettings] = useState<HomeTextSettings>({ model, temperature: 1, reasoning: 'low', outputStyle: 'markdown' });
  const [textPreparing, setTextPreparing] = useState(false), [textError, setTextError] = useState('');
  const textSubmitting = useRef(false);
  const homeComposerMode = home?.composerMode;
  useEffect(() => { if (homeComposerMode && homeComposerMode !== 'text') runtime.setModel(model); }, [homeComposerMode, model, runtime]);
  const documentActivity = useDocumentActivity(documentId, workspaceId);
  const actions = useChatRuntimeActions();
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const attachmentController = useProductionAttachments(workspaceId, transport);
  useAssistantAttachmentTarget(attachmentController.dropTarget);
  const openHomeScreen = (mode: HomeComposerMode) => {
    if (home && home.screen !== mode) router.push(`/?create=${mode}&chat=${encodeURIComponent(state.conversationId ?? '')}`);
  };
  const imageSubmission = useHomeImageSubmit(workspaceId, attachmentController, () => openHomeScreen('image'), home?.ensureConversation);
  const videoSubmission = useHomeVideoSubmit(workspaceId, attachmentController, Boolean(home), () => openHomeScreen('video'), home?.ensureConversation);
  const { addFiles } = attachmentController;
  const editSelection = useCallback(async (files: File[], prompt: string) => {
    if (imageSubmission.preparing || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) {
      throw new Error(tUi("Дождитесь текущего ответа, затем добавьте выделение."));
    }
    if (attachmentController.items.length + files.length > 3) {
      throw new Error(tUi("Для исходника и маски нужны два места. Уберите лишние референсы из запроса."));
    }
    await addFiles(files);
    runtime.setInputValue(prompt);
    runtime.setMode('image-generation');
    home?.onComposerModeChange('image');
  }, [tUi, addFiles, attachmentController.items.length, imageSubmission.preparing, home, runtime]);
  const homeToolRenderers = useMemo(() => createHomeToolRenderers(workspaceId, async (file) => {
    await addFiles([file]);
  }, editSelection), [addFiles, editSelection, workspaceId]);
  useRegisterHostedChatLauncher(
    runtime,
    attachmentController.items.length > 0,
    state.phase,
  );
  useEffect(() => {
    if (!registerAttachmentDropTarget) return;
    registerAttachmentDropTarget(attachmentController.dropTarget);
    return () => registerAttachmentDropTarget(undefined);
  }, [attachmentController.dropTarget, registerAttachmentDropTarget]);
  useDocumentConversationBinding(documentId, workspaceId);
  const isTyping = ['loading', 'submitting', 'streaming'].includes(state.phase);
  const modeSwitch = home ? <HomeComposerModeSwitch mode={home.composerMode} onChange={home.onComposerModeChange} disabled={isTyping || textPreparing || imageSubmission.preparing || videoSubmission.preparing || attachmentController.isUploading || Boolean(submitAuthorization.pendingToolId)} /> : null;
  const cancel = () => {
    if (home) void submitAuthorization.cancelPending();
    actions.cancel();
  };
  const messages = useMemo(
    () => mergeDocumentActivityMessages(home ? state.messages.filter((message) => message.metadata?.source !== 'home-generation') : state.messages, documentActivity, state.conversationId),
    [home, documentActivity, state.conversationId, state.messages],
  );
  const visibleMessages = useMemo(() => {
    const pending = home ? videoSubmission.pendingMessage ?? imageSubmission.pendingMessage : null;
    return pending && !messages.some((message) => message.id === pending.id) ? [...messages, pending] : messages;
  }, [home, messages, imageSubmission.pendingMessage, videoSubmission.pendingMessage]);
  const messagesWithSubjects = useHomeMessageSubjects(visibleMessages, workspaceId, state.conversationId, imageSubmission.subjectPreviews);
  const formattedMessages = useMemo(
    () => prepareChatMessagesForPresentation(home && !home.screen ? [] : home || story || timeline || messagesWithSubjects.length || state.phase !== 'idle' ? (story ? messagesWithSubjects.map((message) => ({ ...message, blocks: message.blocks.filter((block) => block.type !== 'tool-status' || !STORY_WRITING_TOOLS.some((name) => block.description?.includes(name))) })).filter((message) => message.blocks.length) : messagesWithSubjects) : [ui_EMPTY_CHAT_WELCOME]),
    [home, story, timeline, messagesWithSubjects, state.phase, ui_EMPTY_CHAT_WELCOME],
  );
  const presentedMessages = useMemo(() => home || story || timeline ? formattedMessages
    : presentAssistantQuestions(formattedMessages, state.pendingToolCalls), [home, story, timeline, formattedMessages, state.pendingToolCalls]);
  const modelOption: ChatModelOption = {
    id: model,
    label: compactModelLabel(model),
    provider: 'OpenRouter',
    description: tUi("Текст, изображения и документы. Видео и аудио сохраняются без анализа содержимого."),
    capabilities: {
      inputModalities: ['text', 'image', 'document', 'file'],
      supportsImageInputWithTools: true,
      toolCalling: true,
    },
  };

  const submit = async () => {
    if (isTyping || textSubmitting.current || story?.saving || attachmentController.isUploading || attachmentController.hasFailures) return;
    if (!state.inputValue.trim() && attachmentController.attachments.length === 0) return;
    const submitOptions = { attachments: attachmentController.attachments };
    const draft = state.inputValue;
    textSubmitting.current = true; setTextPreparing(true); setTextError('');
    const unlockAttachments = attachmentController.lockForSubmit();
    try {
    if (!await accessGate.ensure()) return;
    if (runtime.getSnapshot().inputValue !== draft || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
    if (home) {
      const conversationId = await home.ensureConversation({ message: draft, attachments: submitOptions.attachments });
      const response = await fetch('/api/chat/v1/home-text-settings', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
        body: JSON.stringify({ conversationId, ...textSettings }), signal: AbortSignal.timeout(30_000) });
      const body = await response.json();
      if (!response.ok || typeof body.settingsId !== 'string') throw new Error(tUi("Не удалось подготовить настройки текста. Проверьте соединение и попробуйте снова."));
      runtime.setContext(homeTextSettingsSelector(body.settingsId));
      runtime.setModel(textSettings.model);
      runtime.setMode('general-chat');
      openHomeScreen('text');
    }
    trackBehavior('ip_assistant_message_sent', { source: home ? 'home' : documentId ? 'editor' : 'workspace' });
    if (runtime.getSnapshot().inputValue !== draft || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
    setTextPreparing(false);
    await runtime.submit(draft, submitOptions);
    await attachmentController.clearAfterSend();
    } catch (error) {
      const accessDenied = accessGate.onError(error);
      if (accessDenied && !runtime.getSnapshot().inputValue) runtime.setInputValue(draft);
      setTextError(accessDenied || runtime.getSnapshot().errorDetails ? '' : error instanceof Error && /[а-яё]/i.test(error.message) ? error.message : tUi("Не удалось отправить сообщение. Попробуйте снова."));
    }
    finally { unlockAttachments(); textSubmitting.current = false; setTextPreparing(false); }
  };

  const renderAttachment = (attachment: ChatAttachment) => (
    'attachmentId' in attachment
      ? (
          <ManagedAttachmentPreview
            attachment={attachment}
            className="cm-message-attachment-image image-production-chat-message-attachment"
            transport={transport}
          />
        )
      : <HomeMessageSubjectPreview attachment={attachment} />
  );

  return (
    <div className={`image-production-chat-host ${home || story?.fullscreen ? 'home-chat-host' : ''}`}>
      <AssistantChat
        activity={state.activity}
        allModelOptions={[modelOption]}
        allowedModelIdsByMode={{ ...createAllowedModels(model), ...(home || story || timeline ? { 'general-chat': [...new Set([model, ...PREFERRED_ANALYSIS_MODEL_IDS])], 'image-generation': [model] } : {}) }}
        attachmentPresentation={{
          composerPreview: 'thumbnails',
          dragAndDrop: 'custom-zone',
        }}
        className={`image-production-chat ${home || story || timeline ? 'home-production-chat' : ''} ${home?.screen ? 'home-image-chat' : home || story || timeline ? 'production-text-chat' : ''} ${story ? story.fullscreen ? 'story-fullscreen-chat' : 'story-production-chat' : timeline ? 'story-production-chat' : ''} ${!home && !story?.fullscreen ? 'assistant-custom-composer' : ''}`}
        errorDetails={isWorkspaceAiAccessError(state.errorDetails) ? undefined : state.errorDetails}
        errorRenderer={home ? () => null : renderImageProductionChatError}
        inputValue={state.inputValue}
        isTyping={isTyping}
        messages={presentedMessages}
        managedAttachments={{
          acceptsFile: attachmentController.acceptsFile,
          acceptsMimeType: attachmentController.acceptsMimeType,
          canAdd: attachmentController.canAdd,
          inputProps: attachmentController.inputProps,
          items: attachmentController.items,
          onCancel: attachmentController.cancel,
          onRemove: attachmentController.remove,
          onRetry: attachmentController.retry,
        }}
        modeOptions={timeline ? [{ id: 'general-chat', label: tUi("Монтаж"), description: tUi("Помощь с параметрами и планом монтажа") }] : story ? [{ id: 'general-chat', label: tUi("Соавтор"), description: tUi("Обсуждение и подготовка текста истории") }] : home ? ui_HOME_MODES : ui_MODE_OPTIONS}
        modelOptions={[]}
        onAddFiles={(files) => { void attachmentController.addFiles(files); }}
        onAction={isTyping || questionAnswer.sending ? undefined : (selection) => {
          if (readAssistantAnswer(selection)) { void questionAnswer.submit(selection); return; }
          const nodeId = getDocumentActivityActionNode(selection, messages);
          if (nodeId) onFocusNode?.(nodeId);
        }}
        onCancel={cancel}
        onConfirmToolCall={async (id) => {
          if (!await accessGate.ensure()) return;
          const result = await actions.confirmToolCall(id);
          if (home && result.toolName === 'home_generate_image' && result.status === 'completed') {
            trackBehavior('ip_generation_requested', { source: 'home', operation: 'generate_image' });
          }
        }}
        onInputChange={actions.setInputValue}
        onModeChange={actions.setMode}
        onModelChange={actions.setModel}
        onRejectToolCall={(id) => { void actions.rejectToolCall(id); }}
        onSubmit={() => { void submit().catch(() => undefined); }}
        onRetry={async () => { if (await accessGate.ensure()) await runtime.retryLastTurn(); }}
        onToggleModelForMode={() => undefined}
        renderAttachment={renderAttachment}
        selectedMode={state.selectedMode}
        selectedModel={state.selectedModel}
        scrollPolicy={(home && !home.screen) || (story && !presentedMessages.length) ? { ...SCROLL_POLICY, autoFollow: false, showJumpToLatest: false } : {
          ...SCROLL_POLICY,
          showJumpToLatest: presentedMessages.length > 0 || state.pendingToolCalls.length > 0 || Boolean(home?.jobs.length),
        }}
        subtitle={timeline ? tUi("Помощь с монтажом") : story ? tUi("Работаем над историей") : home ? tUi("Быстрое создание") : 'Image Production copilot'}
        surface={home || story?.fullscreen ? 'fullscreen' : 'side-panel'}
        title={timeline ? tUi("Ровер · монтаж") : story ? tUi("Ровер · соавтор") : "AI Assistant"}
        toolCalls={home && !home.screen ? [] : story ? presentStoryTools(presentedMessages, state.pendingToolCalls) : presentAssistantQuestionTools(presentedMessages, state.pendingToolCalls)}
        toolCallPresentation={story ? { ...TOOL_CALL_PRESENTATION, resolve: (tool) => [...STORY_WRITING_TOOLS, STORY_QUESTION_TOOL].includes(tool.toolName) ? 'details' : TOOL_CALL_PRESENTATION.resolve(tool) } : home ? { ...TOOL_CALL_PRESENTATION, resolve: (tool) => tool.toolName === 'home_generate_image' ? 'details' : TOOL_CALL_PRESENTATION.resolve(tool) } : TOOL_CALL_PRESENTATION}
        toolRendererRegistry={story ? STORY_TOOL_RENDERERS : home ? homeToolRenderers : TOOL_RENDERER_REGISTRY}
        slots={timeline ? { emptyState: timeline.welcome, beforeComposer: <>{typeof (timeline.notice) === 'string' ? tUi((timeline.notice) as string) : (timeline.notice)}{textError ? <p className="home-image-error" role="alert">{typeof (textError) === 'string' ? tUi((textError) as string) : (textError)}</p> : null}<ProductionTextComposer workspaceId={workspaceId} attachments={attachmentController} model={model} compact saving={textPreparing} onSubmit={submit} onCancel={cancel} /></> } : story ? { emptyState: story.welcome, beforeComposer: <>{typeof (story.notice) === 'string' ? tUi((story.notice) as string) : (story.notice)}{textError ? <p className="home-image-error" role="alert">{typeof (textError) === 'string' ? tUi((textError) as string) : (textError)}</p> : null}<StoryChatComposer workspaceId={workspaceId} attachments={attachmentController} model={model} story compact={!story.fullscreen} subjects={story.subjects} onSubjectsChange={story.onSubjectsChange} saving={story.saving || textPreparing} onSubmit={submit} onCancel={cancel} /></> } : home ? { emptyState: home.screen ? null : home.welcome, beforeComposer: <>{state.errorDetails && !isWorkspaceAiAccessError(state.errorDetails) ? renderImageProductionChatError({ error: state.errorDetails, canRetry: isStandardRetryAllowed(state.errorDetails), isRetrying: isTyping, retry: () => { void accessGate.ensure().then((allowed) => { if (allowed) return runtime.retryLastTurn(); }); } }) : null}{submitAuthorization.error ? <AssistantNotice action={submitAuthorization.retry} actionLabel={tUi("Повторить проверку")}>{typeof (submitAuthorization.error) === 'string' ? tUi((submitAuthorization.error) as string) : (submitAuthorization.error)}</AssistantNotice> : null}<HomeComposer mode={home.composerMode}
          image={{ prefix: modeSwitch, workspaceId, attachments: attachmentController, draft: imageDraft, setDraft: setImageDraft, subjects, setSubjects, submission: imageSubmission, onCancel: cancel }}
          video={{ prefix: modeSwitch, workspaceId, attachments: attachmentController, draft: videoDraft, setDraft: setVideoDraft, submission: videoSubmission, camera: videoCamera, setCamera: setVideoCamera, bindings: videoSlots, setBindings: setVideoSlots }}
          text={{ prefix: modeSwitch, workspaceId, attachments: attachmentController, model, saving: textPreparing, onSubmit: submit, onCancel: cancel,
            parameters: <HomeTextSettingsControls value={textSettings} onChange={setTextSettings} defaultModel={model} disabled={isTyping || textPreparing} /> }} notice={textError ? <p className="home-image-error" role="alert">{typeof (textError) === 'string' ? tUi((textError) as string) : (textError)}</p> : null} /></>,
          header: <HomeChatControls workspaceId={workspaceId} onNew={home.onNew} screen={home.screen} preparing={imageSubmission.preparing || videoSubmission.preparing || Boolean(submitAuthorization.pendingToolId)} />,
          afterMessages: <>{(home.screen ? [...home.jobs, ...videoSubmission.jobs] : []).filter((job) => !state.pendingToolCalls.some((tool) => tool.status === 'completed' && tool.output?.jobId === job.jobId))
            .map((job) => <HomeGenerationResult key={job.jobId} safeResult={job} workspaceId={workspaceId} onUseReference={async (file) => { await addFiles([file]); }} onEditSelection={editSelection} />)}</>,
        } : { beforeComposer: <>{questionAnswer.error ? <p className="home-image-error" role="alert">{typeof (questionAnswer.error) === 'string' ? tUi((questionAnswer.error) as string) : (questionAnswer.error)}</p> : null}{textError ? <p className="home-image-error" role="alert">{typeof (textError) === 'string' ? tUi((textError) as string) : (textError)}</p> : null}<ProductionTextComposer workspaceId={workspaceId} attachments={attachmentController} model={model} compact saving={textPreparing} onSubmit={submit} onCancel={cancel} /></> }}
        helperText={<span>{timeline ? tUi("Монтаж") : story ? tUi("Соавтор") : home ? 'Production' : 'Copilot'} · {compactModelLabel(state.selectedModel || model)}{home ? tUi(" · Результаты сохраняются в Library") : ''}</span>}
      />
    </div>
  );
}
