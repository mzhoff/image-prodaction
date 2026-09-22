import { AgentTurnError } from '@prodactionpro/chat-application';
import { OpenRouterRequestError, type AgentModelContentPart, type ToolCallingLanguageModelGateway, type ToolCallingLanguageModelInput } from '@prodactionpro/chat-connectors';
import { createOpenRouterProviderAdapter } from '@/modules/provider-connections/adapters/openrouter-provider-adapter';
import { ProviderHttpError } from '@/modules/provider-connections/core/provider-errors';
import type { ProviderAdapter, ProviderMessage, ProviderMessagePart, ProviderUsage } from '@/modules/provider-connections/contracts/provider-contracts';
import type { HomeTextSettings } from '../contracts/home-text-settings';
import type { ChatAssistantServerConfig } from './config';

const outputInstructions = {
  plain: 'Оформляй ответ обычным текстом, без Markdown-разметки.',
  markdown: 'Оформляй ответ в Markdown, когда это помогает прочитать его.',
  'numbered-list': 'Оформляй основной ответ нумерованным списком.',
};

/** Product adapter through ChatModule's public gateway; no second agent loop or retries. */
export function createHomeTextGateway(apiKey: string, settings: HomeTextSettings, config: ChatAssistantServerConfig,
  adapter: Pick<ProviderAdapter, 'execute'> = createOpenRouterProviderAdapter({ baseUrl: config.openRouterBaseUrl,
    siteUrl: config.openRouterSiteUrl, appName: 'Reverie Production', requestTimeoutMs: config.providerRequestTimeoutMs })): ToolCallingLanguageModelGateway {
  return { async completeWithTools(input) {
    const messages = await toProviderMessages(input);
    messages.unshift({ role: 'system', parts: [{ modality: 'text', text: outputInstructions[settings.outputStyle] }] });
    try {
      const result = await adapter.execute({ modelId: settings.model, operation: 'generate_text', expectedOutputModalities: ['text'], messages,
        parameters: { temperature: settings.temperature, reasoningEffort: settings.reasoning,
          maxOutputTokens: Math.min(input.maxTokens ?? config.maxOutputTokens, config.maxOutputTokens) } }, { credential: apiKey, signal: input.signal });
      return { content: result.outputs.filter((part) => part.modality === 'text').map((part) => part.text).join('\n'),
        model: result.modelId, provider: result.provider, toolCalls: [], usage: toChatUsage(result.usage) };
    } catch (error) {
      if (error instanceof ProviderHttpError) throw new OpenRouterRequestError('Модель не смогла выполнить запрос. Попробуйте изменить параметры.',
        'CHAT_PROVIDER_REQUEST_FAILED', false, error.status, error.retryAfterMs ?? undefined, error.usage ? toChatUsage(error.usage) : undefined);
      // A timeout after dispatch can still be charged. Never silently repeat the paid operation.
      throw new AgentTurnError('Не удалось получить ответ модели. Запрос мог продолжиться; проверьте историю перед новым запуском.',
        'CHAT_PROVIDER_OUTCOME_UNKNOWN', 502, false, 'provider', 'ambiguous');
    }
  } };
}

function toChatUsage(usage: ProviderUsage) {
  return { promptTokens: usage.inputTokens ?? 0, completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    ...(usage.providerCostUsd !== null ? { costUsd: Number(usage.providerCostUsd) } : {}) };
}

async function toProviderMessages(input: ToolCallingLanguageModelInput): Promise<ProviderMessage[]> {
  return Promise.all(input.messages.map(async (message) => ({
    role: message.role === 'tool' ? 'user' as const : message.role,
    parts: typeof message.content === 'string' ? [{ modality: 'text' as const, text: message.role === 'tool' ? `Результат предыдущего действия: ${message.content}` : message.content }]
      : await Promise.all(message.content.map((part) => toProviderPart(part, input.signal))),
  })));
}
async function toProviderPart(part: AgentModelContentPart, signal?: AbortSignal): Promise<ProviderMessagePart> {
  if (part.type === 'text') return { modality: 'text', text: part.text };
  if ((part.type === 'attachment' && part.kind !== 'image') || !part.delivery) throw new Error('Unsupported model attachment.');
  if (part.delivery.kind === 'remote-url') return { modality: 'image', mediaType: part.mimeType, url: part.delivery.url.reveal() };
  if (part.delivery.kind === 'inline-bytes') return { modality: 'image', mediaType: part.mimeType,
    data: Buffer.from(await part.delivery.source.read(signal)).toString('base64') };
  throw new Error('Unsupported image delivery.');
}
