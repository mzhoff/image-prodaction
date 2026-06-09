export interface TelegramVerifyChannelResult {
  chatId: string;
  title: string;
  type: string;
  username: string | null;
  membersCount: number | null;
  botIsAdmin: boolean;
}

export interface TelegramSendPostResult {
  messageIds: number[];
  chatId: string;
  date: number | null;
  postUrl: string | null;
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return { parsed: null as unknown, rawText: '' };
  }

  try {
    return { parsed: JSON.parse(text) as unknown, rawText: text };
  } catch {
    return { parsed: null as unknown, rawText: text };
  }
}

function formatErrorPayload(error: unknown) {
  if (error == null) return 'Telegram request failed';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    if ('description' in error && typeof (error as { description?: unknown }).description === 'string') {
      return (error as { description: string }).description;
    }

    if ('error' in error && typeof (error as { error?: unknown }).error === 'string') {
      return (error as { error: string }).error;
    }

    try {
      return JSON.stringify(error).slice(0, 700);
    } catch {
      return 'Telegram request failed';
    }
  }
  return `${error}`;
}

function formatApiError(error: unknown, fallback = 'Telegram request failed') {
  if (typeof error === 'string') return error;
  if (!error) return fallback;
  return formatErrorPayload(error);
}

export async function verifyTelegramChannel(payload: { channel: string }) {
  let response: Response;
  try {
    response = await fetch('/api/telegram/verify-channel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(formatApiError(error, `Request failed: ${String(error)}`));
  }

  const { parsed, rawText } = await parseApiResponse(response);
  const result = parsed as TelegramVerifyChannelResult & { error?: unknown };
  if (!response.ok || (result as { error?: string })?.error) {
    const error = (parsed && typeof parsed === 'object' ? (parsed as { error?: unknown }).error : rawText);
    throw new Error(formatApiError(error, `HTTP ${response.status}: ${response.statusText}`));
  }

  return result as TelegramVerifyChannelResult;
}

export async function sendTelegramPost(payload: {
  channel: string;
  contentHtml: string;
  disableWebPagePreview?: boolean;
  media?: File[];
}) {
  const formData = new FormData();
  formData.append('channel', payload.channel);
  formData.append('contentHtml', payload.contentHtml);
  if (payload.disableWebPagePreview) {
    formData.append('disableWebPagePreview', 'true');
  }

  (payload.media ?? []).forEach((file) => {
    formData.append('media', file, file.name);
  });

  let response: Response;
  try {
    response = await fetch('/api/telegram/send-post', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw new Error(formatApiError(error, `Request failed: ${String(error)}`));
  }

  const { parsed, rawText } = await parseApiResponse(response);
  const result = parsed as TelegramSendPostResult & { error?: unknown };
  if (!response.ok || (result as { error?: string })?.error) {
    const error = (parsed && typeof parsed === 'object' ? (result as { error?: unknown }).error : rawText);
    throw new Error(formatApiError(error, `HTTP ${response.status}: ${response.statusText}`));
  }

  return result as TelegramSendPostResult;
}
