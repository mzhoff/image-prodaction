const DEFAULT_MAILPIT_URL = 'http://localhost:8025';
const DEFAULT_TIMEOUT_MS = 30_000;

interface MailpitAddress {
  Address?: string;
}

interface MailpitMessageSummary {
  Created?: string;
  ID?: string;
  Subject?: string;
  To?: Array<MailpitAddress | string>;
}

interface MailpitMessagesResponse {
  messages?: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
  HTML?: string;
  Subject?: string;
  Text?: string;
  To?: Array<MailpitAddress | string>;
}

interface WaitForEmailLinkOptions {
  mailpitUrl?: string;
  pathIncludes: string;
  recipient: string;
  subjectIncludes: string;
  timeoutMs?: number;
}

export async function waitForEmailLink({
  mailpitUrl = process.env.MAILPIT_HTTP_URL ?? DEFAULT_MAILPIT_URL,
  pathIncludes,
  recipient,
  subjectIncludes,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WaitForEmailLinkOptions) {
  const deadline = Date.now() + timeoutMs;
  const normalizedRecipient = recipient.trim().toLowerCase();
  let lastFailure = 'No matching message has arrived.';

  while (Date.now() < deadline) {
    try {
      const summaries = await listMessages(mailpitUrl);
      const candidates = summaries
        .filter((message) => includesRecipient(message.To, normalizedRecipient))
        .filter((message) => message.Subject?.includes(subjectIncludes))
        .sort((left, right) => Date.parse(right.Created ?? '') - Date.parse(left.Created ?? ''));

      for (const candidate of candidates) {
        if (!candidate.ID) continue;
        const detail = await getMessage(mailpitUrl, candidate.ID);
        const link = extractLinks(`${detail.HTML ?? ''}\n${detail.Text ?? ''}`)
          .find((url) => new URL(url).pathname.includes(pathIncludes));
        if (link) return link;
        lastFailure = `Message "${candidate.Subject ?? ''}" did not contain a ${pathIncludes} link.`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for Mailpit email to ${recipient} with subject containing `
    + `"${subjectIncludes}". ${lastFailure}`,
  );
}

async function listMessages(mailpitUrl: string) {
  const response = await fetch(new URL('/api/v1/messages', ensureTrailingSlash(mailpitUrl)), {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Mailpit messages API returned ${response.status}.`);
  const payload = await response.json() as MailpitMessagesResponse;
  return payload.messages ?? [];
}

async function getMessage(mailpitUrl: string, id: string) {
  const response = await fetch(
    new URL(`/api/v1/message/${encodeURIComponent(id)}`, ensureTrailingSlash(mailpitUrl)),
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error(`Mailpit message API returned ${response.status}.`);
  return response.json() as Promise<MailpitMessageDetail>;
}

function includesRecipient(
  addresses: Array<MailpitAddress | string> | undefined,
  recipient: string,
) {
  return addresses?.some((address) => (
    (typeof address === 'string' ? address : address.Address)?.trim().toLowerCase() === recipient
  )) ?? false;
}

function extractLinks(content: string) {
  return Array.from(content.matchAll(/https?:\/\/[^\s"'<>]+/gu), ([match]) => (
    decodeHtmlEntities(match).replace(/[),.;]+$/u, '')
  ));
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .replaceAll('&#x26;', '&');
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
