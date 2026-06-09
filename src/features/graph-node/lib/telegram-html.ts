import { getTelegramRichTextBlocks, TELEGRAM_TEXT_FORMAT } from './telegram-rich-text';
import { getTelegramRichTextRunText } from './telegram-rich-text-reader';
import { type TelegramRichTextRun } from './telegram-rich-text-contract';
import { splitTelegramRichTextRunsByQuote } from './telegram-rich-text-reader';
import { parseTelegramMessageBlocks } from './telegram-message-blocks';
import { parseTelegramInlineText } from './telegram-inline-parser';

interface TelegramHtmlOptions {
  messageText: string;
  messageRichText?: string;
}

export function toTelegramHtmlFromEditor(options: TelegramHtmlOptions) {
  const messageText = options.messageText ?? '';
  const richBlocks = getTelegramRichTextBlocks(messageText, options.messageRichText);
  if (!richBlocks || richBlocks.length === 0) {
    return parseTelegramMessageBlocks(messageText)
      .map((block) => (
        block.kind === 'quote'
          ? `<blockquote>${replaceLineBreaks(escapeTelegramHtml(block.text))}</blockquote>`
          : replaceLineBreaks(escapeTelegramHtml(block.text))
      ))
      .join('\n');
  }

  const renderedBlocks = richBlocks
    .map((block) => {
      const groups = splitTelegramRichTextRunsByQuote(block.runs);
      if (groups.length === 0) {
        return '';
      }

      return groups
        .map((group) => {
          const html = group.runs
            .map((run) => renderTelegramRun(run))
            .join('');
          const withLineBreaks = replaceLineBreaks(html);
          return group.quote ? `<blockquote>${withLineBreaks}</blockquote>` : withLineBreaks;
        })
        .join('\n');
    })
    .join('\n');

  return renderedBlocks || escapeTelegramHtml(messageText);
}

export function toTelegramHtmlForClipboard(options: TelegramHtmlOptions) {
  if (options.messageRichText?.trim()) {
    return toTelegramHtmlFromEditor(options);
  }

  return parseTelegramMessageBlocks(options.messageText ?? '')
    .map((block) => {
      if (block.kind === 'quote') {
        return `<blockquote>${renderInlineTelegramText(block.text)}</blockquote>`;
      }

      return renderInlineTelegramText(block.text);
    })
    .join('\n');
}

export function toTelegramPlainTextForClipboard(options: TelegramHtmlOptions) {
  const hasRichText = options.messageRichText?.trim();
  if (!hasRichText) return options.messageText ?? '';
  return getTelegramPlainTextFromRichText(options.messageRichText);
}

function getTelegramPlainTextFromRichText(messageRichText?: string) {
  try {
    const blocks = messageRichText
      ? getTelegramRichTextBlocks('', messageRichText)
      : null;
    return blocks?.map((block) => getTelegramRichTextRunText(block.runs).trimEnd()).join('\n') ?? '';
  } catch {
    return '';
  }
}

function renderTelegramRun(run: TelegramRichTextRun) {
  const escaped = applyFormat(run, escapeTelegramHtml(run.text));
  const withLink = run.link ? `<a href="${escapeTelegramAttribute(run.link)}">${escaped}</a>` : escaped;
  return run.spoiler ? `<tg-spoiler>${withLink}</tg-spoiler>` : withLink;
}

function applyFormat(run: TelegramRichTextRun, content: string) {
  if ((run.format & TELEGRAM_TEXT_FORMAT.code) !== 0) {
    content = `<code>${content}</code>`;
  }

  if ((run.format & TELEGRAM_TEXT_FORMAT.underline) !== 0) {
    content = `<u>${content}</u>`;
  }

  if ((run.format & TELEGRAM_TEXT_FORMAT.strike) !== 0) {
    content = `<s>${content}</s>`;
  }

  if ((run.format & TELEGRAM_TEXT_FORMAT.italic) !== 0) {
    content = `<i>${content}</i>`;
  }

  if ((run.format & TELEGRAM_TEXT_FORMAT.bold) !== 0) {
    content = `<b>${content}</b>`;
  }

  return content;
}

function renderInlineTelegramText(value: string) {
  return parseTelegramInlineText(value)
    .map((token) => {
      const safeContent = escapeTelegramHtml(token.content);
      if (token.type === 'bold') return `<b>${safeContent}</b>`;
      if (token.type === 'code') return `<code>${safeContent}</code>`;
      if (token.type === 'italic') return `<i>${safeContent}</i>`;
      if (token.type === 'underline') return `<u>${safeContent}</u>`;
      if (token.type === 'strike') return `<s>${safeContent}</s>`;
      if (token.type === 'spoiler') return `<tg-spoiler>${safeContent}</tg-spoiler>`;
      if (token.type === 'link') {
        const href = escapeTelegramAttribute(token.href ?? '');
        return href ? `<a href="${href}">${safeContent}</a>` : safeContent;
      }

      return safeContent;
    })
    .join('');
}

function replaceLineBreaks(value: string) {
  return value.replace(/\r/g, '').replace(/\n/g, '<br>');
}

function escapeTelegramHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeTelegramAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
