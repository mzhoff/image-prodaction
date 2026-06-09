'use client';

import { ImageIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { getTelegramQuoteText, parseTelegramMessageBlocks } from '../lib/telegram-message-blocks';
import { getTelegramMediaLayout } from '../lib/telegram-media-layout';
import {
  getTelegramRichTextBlocks,
  getTelegramRichTextRunText,
  parseTelegramInlineText,
  splitTelegramRichTextRunsByQuote,
  TELEGRAM_TEXT_FORMAT,
  type TelegramInlineTokenType,
  type TelegramRichTextRun,
} from '../lib/telegram-rich-text';
import type { TelegramPreviewMediaItem } from '../model/use-telegram-publication-node-model';

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
  const blockText = getTelegramRichTextRunText(runs);
  if (blockText.length === 0) {
    return [
      <p key={`paragraph-${index}`} className="telegram-message-paragraph">
        {renderBlankLine()}
      </p>,
    ];
  }

  const quoteText = getTelegramQuoteText(blockText);
  if (quoteText) {
    return [(
      <blockquote key={`rich-quote-${index}`} className="telegram-message-quote">
        {renderInlineText(quoteText, `rich-quote-${index}`)}
      </blockquote>
    )];
  }

  return splitTelegramRichTextRunsByQuote(runs).map((group, groupIndex) => {
    const key = `rich-${group.quote ? 'quote' : 'paragraph'}-${index}-${groupIndex}`;
    const groupContent = group.runs.length
      ? group.runs.map((run, runIndex) => renderRichTextRun(run, `${key}-${runIndex}`))
      : renderParagraphContent('');

    return group.quote ? (
      <blockquote key={key} className="telegram-message-quote">
        {groupContent}
      </blockquote>
    ) : (
      <p key={key} className="telegram-message-paragraph">
        {groupContent}
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

function renderMessageBlocks(messageText: string) {
  const blocks = parseTelegramMessageBlocks(messageText);
  return blocks.map((block, index) => {
    if (block.kind === 'quote') {
      return (
        <blockquote key={`quote-${index}`} className="telegram-message-quote">
          {renderInlineText(block.text, `quote-${index}`)}
        </blockquote>
      );
    }

    return (
      <p key={`paragraph-${index}`} className="telegram-message-paragraph">
        {block.text ? renderParagraphContent(block.text, `paragraph-${index}`) : renderBlankLine(`paragraph-empty-${index}`)}
      </p>
    );
  });
}

function renderParagraphContent(block: string, keyPrefix = '') {
  if (!block) {
    return renderBlankLine(keyPrefix ? `${keyPrefix}-empty` : undefined);
  }

  return renderInlineText(block, keyPrefix);
}

function renderBlankLine(keyPrefix?: string) {
  return <span key={keyPrefix} className="telegram-message-blank-line">{'\u00A0'}</span>;
}

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  const tokens = parseTelegramInlineText(text);
  return tokens.map((token, index) => renderInlineToken(
    token.type,
    token.content,
    token.type === 'link' ? token.href : undefined,
    `${keyPrefix}-${index}`,
  ));
}

function renderInlineToken(type: TelegramInlineTokenType, content: string, url: string | undefined, key: string) {
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
