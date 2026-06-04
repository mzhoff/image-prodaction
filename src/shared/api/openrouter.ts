const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=all';
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';

interface OpenRouterFetchOptions extends RequestInit {
  next?: {
    revalidate?: number;
  };
}

export class OpenRouterRequestError extends Error {
  status: number;
  body?: string;
  code: 'upstream_error' | 'network_error';

  constructor(message: string, status: number, code: OpenRouterRequestError['code'], body?: string) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface OpenRouterMessageContentText {
  type: 'text';
  text: string;
}

export interface OpenRouterMessageContentImage {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<OpenRouterMessageContentText | OpenRouterMessageContentImage>;
}

export interface OpenRouterImageConfig {
  aspect_ratio?: string;
  image_size?: string;
}

export interface OpenRouterReasoningConfig {
  effort?: 'low' | 'medium' | 'high';
}

export async function sendOpenRouterChat({
  model,
  messages,
  modalities,
  imageConfig,
  maxTokens,
  reasoning,
  temperature,
}: {
  model: string;
  messages: OpenRouterChatMessage[];
  modalities?: Array<'text' | 'image'>;
  imageConfig?: OpenRouterImageConfig;
  maxTokens?: number;
  reasoning?: OpenRouterReasoningConfig;
  temperature?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const response = await fetchOpenRouter(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Reverie Image Production Pipeline',
    },
    body: JSON.stringify(removeUndefined({
      model,
      messages,
      modalities,
      image_config: imageConfig,
      max_tokens: maxTokens,
      reasoning,
      temperature,
      stream: false,
    })),
  }, 'OpenRouter generation request');

  if (!response.ok) {
    throw await createOpenRouterResponseError(response, 'OpenRouter generation request');
  }

  return response.json() as Promise<{
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{
          type: 'image_url';
          image_url: {
            url: string;
          };
        }>;
      };
    }>;
  }>;
}

export async function fetchOpenRouterModels() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const headers: HeadersInit = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const response = await fetchOpenRouter(OPENROUTER_MODELS_URL, {
    headers,
    next: { revalidate: 300 },
  }, 'OpenRouter models request', 1);

  if (!response.ok) {
    throw await createOpenRouterResponseError(response, 'OpenRouter models request');
  }

  return response.json() as Promise<{
    data?: unknown[];
  }>;
}

export async function fetchOpenRouterKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const response = await fetchOpenRouter(OPENROUTER_KEY_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    next: { revalidate: 60 },
  }, 'OpenRouter balance request', 1);

  if (!response.ok) {
    throw await createOpenRouterResponseError(response, 'OpenRouter balance request');
  }

  return response.json() as Promise<{
    data?: {
      limit?: number | null;
      limit_remaining?: number | null;
      usage?: number | null;
      usage_daily?: number | null;
      usage_monthly?: number | null;
    };
  }>;
}

export function getOpenRouterErrorStatus(error: unknown) {
  if (error instanceof OpenRouterRequestError) return error.status;
  return 502;
}

export function formatOpenRouterError(error: unknown, fallback: string) {
  if (error instanceof OpenRouterRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

async function fetchOpenRouter(url: string, options: OpenRouterFetchOptions, label: string, retries = 0) {
  let attempt = 0;

  while (true) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt >= retries) {
        const reason = error instanceof Error ? error.message : 'fetch failed';
        throw new OpenRouterRequestError(`${label} network error: ${reason}`, 503, 'network_error');
      }
      attempt += 1;
      await delay(400 * attempt);
    }
  }
}

async function createOpenRouterResponseError(response: Response, label: string) {
  const body = await response.text().catch(() => '');
  const detail = extractOpenRouterErrorMessage(body);
  return new OpenRouterRequestError(
    `${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    response.status,
    'upstream_error',
    body,
  );
}

function extractOpenRouterErrorMessage(body: string) {
  if (!body) return '';

  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        code?: string | number;
      } | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message ?? parsed.message ?? body.slice(0, 500);
  } catch {
    return body.slice(0, 500);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
