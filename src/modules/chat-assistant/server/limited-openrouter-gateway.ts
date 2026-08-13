import {
  OpenRouterClient,
  type ToolCallingLanguageModelGateway,
  type ToolCallingLanguageModelInput,
} from '@prodactionpro/chat-connectors';
import { collapseConsecutiveDuplicateAgentUserMessages } from '../core/chat-retry-deduplication';
import { addTokenUsage, createToolInputCorrectionMessages } from '../core/tool-input-recovery';
import { runWithProviderRetry } from './provider-retry';

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
    client?: ToolCallingLanguageModelGateway;
    sleep?: (delayMs: number) => Promise<void>;
    timeoutMs: number;
  }) {
    this.maxAttempts = input.maxAttempts;
    this.maxOutputTokens = input.maxOutputTokens;
    this.retryBaseDelayMs = input.retryBaseDelayMs;
    this.sleep = input.sleep;
    this.client = input.client ?? new OpenRouterClient({
      apiKey: input.apiKey,
      appTitle: input.appTitle,
      baseUrl: input.baseUrl,
      httpReferer: input.httpReferer,
      timeoutMs: input.timeoutMs,
    });
  }

  private readonly maxAttempts: number;
  private readonly maxOutputTokens: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep?: (delayMs: number) => Promise<void>;

  async completeWithTools(input: ToolCallingLanguageModelInput) {
    let messages = collapseConsecutiveDuplicateAgentUserMessages(input.messages);
    let usage: Awaited<ReturnType<ToolCallingLanguageModelGateway['completeWithTools']>>['usage'];

    for (let correction = 0; correction <= MAX_TOOL_INPUT_CORRECTIONS; correction += 1) {
      const result = await runWithProviderRetry({
        maxAttempts: this.maxAttempts,
        operation: () => this.client.completeWithTools({
          ...input,
          messages,
          maxTokens: Math.min(input.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          temperature: input.temperature ?? 0.2,
        }),
        retryBaseDelayMs: this.retryBaseDelayMs,
        signal: input.signal,
        sleep: this.sleep,
      });
      usage = addTokenUsage(usage, result.usage);
      const correctionMessages = createToolInputCorrectionMessages({ result, tools: input.tools });
      if (!correctionMessages) return { ...result, usage };
      if (correction === MAX_TOOL_INPUT_CORRECTIONS) return { ...result, usage };
      messages = [...messages, ...correctionMessages];
    }

    throw new Error('Assistant tool input recovery ended unexpectedly.');
  }
}
