import {
  OpenRouterClient,
  type ToolCallingLanguageModelGateway,
  type ToolCallingLanguageModelInput,
} from '@prodactionpro/chat-connectors';
import { addTokenUsage, createToolInputCorrectionMessages } from '../core/tool-input-recovery';

const MAX_TOOL_INPUT_CORRECTIONS = 2;

export class LimitedOpenRouterGateway implements ToolCallingLanguageModelGateway {
  private readonly client: ToolCallingLanguageModelGateway;

  constructor(input: {
    apiKey: string;
    appTitle: string;
    baseUrl: string;
    httpReferer?: string;
    maxAttempts: number;
    maxOutputTokens: number;
    retryBaseDelayMs: number;
    retryDeadlineMs: number;
    client?: ToolCallingLanguageModelGateway;
    timeoutMs: number;
  }) {
    this.maxOutputTokens = input.maxOutputTokens;
    this.client = input.client ?? new OpenRouterClient({
      apiKey: input.apiKey,
      appTitle: input.appTitle,
      baseUrl: input.baseUrl,
      httpReferer: input.httpReferer,
      protectedErrorReporter: ({ responseBody: _responseBody, ...safeReport }) => {
        console.error('[chat-assistant-provider-attempt]', safeReport);
      },
      retryPolicy: {
        deadlineMs: input.retryDeadlineMs,
        initialBackoffMs: input.retryBaseDelayMs,
        maxAttempts: input.maxAttempts,
      },
      timeoutMs: input.timeoutMs,
    });
  }

  private readonly maxOutputTokens: number;

  async completeWithTools(input: ToolCallingLanguageModelInput) {
    let messages = input.messages;
    let usage: Awaited<ReturnType<ToolCallingLanguageModelGateway['completeWithTools']>>['usage'];

    for (let correction = 0; correction <= MAX_TOOL_INPUT_CORRECTIONS; correction += 1) {
      const result = await this.client.completeWithTools({
        ...input,
        messages,
        maxTokens: Math.min(input.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        temperature: input.temperature ?? 0.2,
      });
      usage = addTokenUsage(usage, result.usage);
      const correctionMessages = createToolInputCorrectionMessages({ result, tools: input.tools });
      if (!correctionMessages || correction === MAX_TOOL_INPUT_CORRECTIONS) {
        return { ...result, usage };
      }
      console.warn('[chat-assistant-tool-input-correction]', {
        correction: correction + 1,
        toolCallCount: result.toolCalls.length,
        toolNames: result.toolCalls.slice(0, 4).map((toolCall) => toolCall.name),
      });
      messages = [...messages, ...correctionMessages];
    }

    throw new Error('Assistant tool input recovery ended unexpectedly.');
  }
}
