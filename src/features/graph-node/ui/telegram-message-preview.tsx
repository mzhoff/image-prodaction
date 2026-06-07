'use client';

import { ImageIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { getTelegramMediaLayout } from '../lib/telegram-media-layout';
import { getTelegramRichTextBlocks, getTelegramRichTextRunText, TELEGRAM_TEXT_FORMAT, type TelegramRichTextRun } from '../lib/telegram-rich-text';
import type { TelegramPreviewMediaItem } from '../model/use-telegram-publication-node-model';

type InlineTokenType = 'bold' | 'code' | 'hashtag' | 'italic' | 'link' | 'spoiler' | 'strike' | 'underline';

interface InlineRule {
  type: InlineTokenType;
  regex: RegExp;
}

const INLINE_RULES: InlineRule[] = [
  { type: 'link', regex: /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/ },
  { type: 'bold', regex: /\*\*([^*]+)\*\*/ },
  { type: 'underline', regex: /__([^_]+)__/ },
  { type: 'strike', regex: /~~([^~]+)~~/ },
  { type: 'spoiler', regex: /\|\|([^|]+)\|\|/ },
  { type: 'italic', regex: /_([^_]+)_/ },
  { type: 'code', regex: /`([^`]+)`/ },
  { type: 'hashtag', regex: /(#[\p{L}\p{N}_]{1,64})/u },
];

interface TelegramMessagePreviewProps {
  mediaItems: TelegramPreviewMediaItem[];
  mediaOverflowCount: number;
  messageRichText?: string;
  messageText: string;
  onMediaReorder: (fromIndex: number, toIndex: number) => void;
}

export function TelegramMessagePreview({
  mediaItems,
  mediaOverflowCount,
  messageRichText,
  messageText,
  onMediaReorder,
}: TelegramMessagePreviewProps) {
  const hasMedia = mediaItems.length > 0;
  const hasMessage = messageText.trim().length > 0 || Boolean(messageRichText?.trim());

  return (
    <div className={hasMedia ? 'telegram-preview-shell telegram-preview-shell-media' : 'telegram-preview-shell telegram-preview-shell-text'}>
      <div className={hasMedia ? 'telegram-message-bubble telegram-message-bubble-media' : 'telegram-message-bubble'}>
        {hasMedia ? (
          <PublicationMediaGrid
            extraCount={mediaOverflowCount}
            items={mediaItems}
            onReorder={onMediaReorder}
          />
        ) : null}
        <div className="telegram-message-text">
          {hasMessage ? renderTelegramMessageBlocks(messageText, messageRichText) : (
            <div className="telegram-message-empty">Message preview</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicationMediaGrid({
  extraCount,
  items,
  onReorder,
}: {
  extraCount: number;
  items: TelegramPreviewMediaItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const layout = useMemo(() => getTelegramMediaLayout(items.length), [items.length]);
  const style: CSSProperties = {
    aspectRatio: layout.aspectRatio,
    gridTemplateAreas: layout.template,
    gridTemplateColumns: layout.columns,
    gridTemplateRows: layout.rows,
  };

  return (
    <div className="telegram-media-album" style={style} data-node-interactive>
      {items.map((item, index) => (
        <PublicationMediaCell
          key={item.assetId}
          area={layout.areas[index]}
          dragIndex={dragIndex}
          extraCount={index === items.length - 1 ? extraCount : 0}
          index={index}
          item={item}
          onDragIndexChange={setDragIndex}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}

function PublicationMediaCell({
  area,
  dragIndex,
  extraCount,
  index,
  item,
  onDragIndexChange,
  onReorder,
}: {
  area: string;
  dragIndex: number | null;
  extraCount: number;
  index: number;
  item: TelegramPreviewMediaItem;
  onDragIndexChange: (index: number | null) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const url = useAssetUrl(item.assetId);

  return (
    <button
      type="button"
      className={dragIndex === index ? 'telegram-media-cell telegram-media-cell-dragging' : 'telegram-media-cell'}
      draggable={Boolean(url)}
      style={{ gridArea: area }}
      onDragStart={(event) => {
        if (!url) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.assetId);
        onDragIndexChange(index);
      }}
      onDragOver={(event) => {
        if (dragIndex === null || dragIndex === index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
        onDragIndexChange(null);
      }}
      onDragEnd={() => onDragIndexChange(null)}
      data-node-interactive
      aria-label={`Media ${index + 1}`}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="telegram-media-cell-backdrop" src={url} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="telegram-media-cell-image" src={url} alt={item.asset.name} draggable={false} />
          {extraCount > 0 ? <span className="telegram-media-extra">+{extraCount}</span> : null}
        </>
      ) : (
        <span className="telegram-media-empty">
          <ImageIcon size={15} />
        </span>
      )}
    </button>
  );
}

function renderTelegramMessageBlocks(messageText: string, messageRichText: string | undefined) {
  const richBlocks = getTelegramRichTextBlocks(messageText, messageRichText);
  if (!richBlocks) return renderMessageBlocks(messageText);

  return richBlocks.flatMap((block, index) => renderRichTextBlock(block.runs, index));
}

function renderRichTextBlock(runs: TelegramRichTextRun[], index: number) {
  const blockText = getTelegramRichTextRunText(runs).trim();
  if (!blockText) return [];

  const quoteText = getQuoteText(blockText);
  if (quoteText) {
    return [(
      <blockquote key={`rich-quote-${index}`} className="telegram-message-quote">
        {renderInlineText(quoteText, `rich-quote-${index}`)}
      </blockquote>
    )];
  }

  return splitRichRunsByQuote(runs).map((group, groupIndex) => {
    const groupText = getTelegramRichTextRunText(group.runs).trim();
    if (!groupText) return null;
    const key = `rich-${group.quote ? 'quote' : 'paragraph'}-${index}-${groupIndex}`;
    const content = group.runs.map((run, runIndex) => renderRichTextRun(run, `${key}-${runIndex}`));

    return group.quote ? (
      <blockquote key={key} className="telegram-message-quote">
        {content}
      </blockquote>
    ) : (
      <p key={key} className="telegram-message-paragraph">
        {content}
      </p>
    );
  });
}

function renderRichTextRun(run: TelegramRichTextRun, key: string): ReactNode {
  if (!run.text) return null;

  let content: ReactNode = renderInlineText(run.text, key);
  if (run.format & TELEGRAM_TEXT_FORMAT.code) content = <code key={`${key}-code`}>{content}</code>;
  if (run.format & TELEGRAM_TEXT_FORMAT.strike) content = <s key={`${key}-strike`}>{content}</s>;
  if (run.format & TELEGRAM_TEXT_FORMAT.underline) {
    content = <span key={`${key}-underline`} className="telegram-message-underline">{content}</span>;
  }
  if (run.format & TELEGRAM_TEXT_FORMAT.italic) content = <em key={`${key}-italic`}>{content}</em>;
  if (run.format & TELEGRAM_TEXT_FORMAT.bold) content = <strong key={`${key}-bold`}>{content}</strong>;
  if (run.link) {
    content = (
      <a key={`${key}-link`} href={run.link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        {content}
      </a>
    );
  }
  if (run.spoiler) content = <span key={`${key}-spoiler`} className="telegram-message-spoiler">{content}</span>;
  return content;
}

function splitRichRunsByQuote(runs: TelegramRichTextRun[]) {
  return runs.reduce<Array<{ quote: boolean; runs: TelegramRichTextRun[] }>>((groups, run) => {
    const quote = Boolean(run.quote);
    const previousGroup = groups[groups.length - 1];
    const runWithoutQuote = quote ? { ...run, quote: false } : run;
    if (previousGroup && previousGroup.quote === quote) {
      previousGroup.runs.push(runWithoutQuote);
      return groups;
    }

    groups.push({ quote, runs: [runWithoutQuote] });
    return groups;
  }, []);
}

function renderMessageBlocks(messageText: string) {
  return messageText
    .trim()
    .split(/\n{2,}/)
    .map((block, index) => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return null;
      const quoteText = getQuoteText(trimmedBlock);
      if (quoteText) {
        return (
          <blockquote key={`quote-${index}`} className="telegram-message-quote">
            {renderInlineText(quoteText, `quote-${index}`)}
          </blockquote>
        );
      }

      return (
        <p key={`paragraph-${index}`} className="telegram-message-paragraph">
          {renderInlineText(trimmedBlock, `paragraph-${index}`)}
        </p>
      );
    });
}

function getQuoteText(block: string) {
  const lines = block.split('\n');
  if (!lines.every((line) => line.trimStart().startsWith('>'))) return '';
  return lines.map((line) => line.trimStart().replace(/^>\s?/, '')).join('\n').trim();
}

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  const match = findNextInlineMatch(text);
  if (!match) return [text];

  const before = text.slice(0, match.index);
  const matchedText = match.match[0];
  const content = match.match[1] ?? '';
  const url = match.type === 'link' ? match.match[2] : undefined;
  const after = text.slice(match.index + matchedText.length);
  const nodes: ReactNode[] = [];

  if (before) nodes.push(before);
  nodes.push(renderInlineToken(match.type, content, url, `${keyPrefix}-${match.index}`));
  if (after) nodes.push(...renderInlineText(after, `${keyPrefix}-after-${match.index}`));
  return nodes;
}

function findNextInlineMatch(text: string) {
  return INLINE_RULES.reduce<{
    index: number;
    match: RegExpMatchArray;
    type: InlineTokenType;
  } | null>((bestMatch, rule) => {
    const match = text.match(rule.regex);
    if (!match || match.index === undefined) return bestMatch;
    if (!bestMatch || match.index < bestMatch.index) {
      return { index: match.index, match, type: rule.type };
    }
    return bestMatch;
  }, null);
}

function renderInlineToken(type: InlineTokenType, content: string, url: string | undefined, key: string) {
  if (type === 'bold') return <strong key={key}>{content}</strong>;
  if (type === 'hashtag') return <span key={key} className="telegram-message-hashtag">{content}</span>;
  if (type === 'italic') return <em key={key}>{content}</em>;
  if (type === 'underline') return <span key={key} className="telegram-message-underline">{content}</span>;
  if (type === 'strike') return <s key={key}>{content}</s>;
  if (type === 'spoiler') return <span key={key} className="telegram-message-spoiler">{content}</span>;
  if (type === 'code') return <code key={key}>{content}</code>;
  if (type === 'link') {
    return (
      <a key={key} href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        {content}
      </a>
    );
  }
  return content;
}
