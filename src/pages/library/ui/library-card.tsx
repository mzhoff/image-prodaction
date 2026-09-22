'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, MoreHorizontal, Play, Video } from '@prodactionpro/ui-core/icons';
import { memo, useEffect, useState } from 'react';
import type { LibraryAssetItem } from '../model/types';
import { formatLibraryByteSize, formatLibraryTimestamp } from '../lib/library-gallery';
import { useLibraryAssetActions } from './library-asset-actions';

export const LibraryCard = memo(function LibraryCard({
  item,
  filterQuery,
  width,
}: {
  item: LibraryAssetItem;
  filterQuery: string;
  width: number;
}) {
  const tUi = useTranslations();
  const language = useFormatLocale();
  const actions = useLibraryAssetActions();
  const previewHref = `/library/${encodeURIComponent(item.id)}${filterQuery ? `?${filterQuery}` : ''}`;
  const previewUrl = item.thumbnailUrl || item.contentUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [previewUrl]);
  const detailsId = `library-details-${item.id}`;
  return (
    <article className={`library-card${actions.selection.selectedIds.has(item.id) ? ' library-card-selected' : ''}`}
      data-asset-id={item.id} style={{ width }} onContextMenu={(event) => actions.openMenu(event, item)}>
      <Link href={previewHref} prefetch={false} className="library-card-preview"
        onClick={(event) => { if (actions.selection.active) { event.preventDefault(); if (!actions.busy) actions.selection.toggle(item); } }}
        aria-label={`${actions.selection.active ? tUi("Выбрать") : tUi("Открыть")} ${item.originalName}`} aria-describedby={detailsId} draggable={false}>
        {previewUrl && !failed ? <Image
          src={previewUrl}
          alt=""
          fill
          sizes={`${Math.ceil(width)}px`}
          unoptimized
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)} draggable={false}
        /> : <span className="library-media-placeholder" aria-hidden="true">
          {item.mediaKind === 'video' ? <Video size={30} /> : <ImageIcon size={30} />}
        </span>}
        {item.mediaKind === 'video' ? <span className="library-video-play-badge" aria-hidden="true"><Play fill="currentColor" size={18} /></span> : null}
        <span className="library-card-details" id={detailsId}>
          <span>{item.width && item.height ? `${item.width} × ${item.height}` : tUi("Разрешение неизвестно")}<span aria-hidden="true"> · </span>{formatLibraryByteSize(item.byteSize, language)}</span>
          <time dateTime={item.createdAt}>{formatLibraryTimestamp(item.createdAt, language)}</time>
        </span>
      </Link>
        {actions.selection.active ? <label className="library-card-checkbox">
          <input type="checkbox" aria-label={tUi("Выбрать {p1}", { p1: item.originalName })} checked={actions.selection.selectedIds.has(item.id)}
            disabled={actions.busy} onChange={() => actions.selection.toggle(item)} />
        </label> : null}
        <button type="button" className="library-card-actions"
          aria-label={tUi("Действия с {p1}", { p1: item.originalName })} onClick={(event) => actions.openMenu(event, item)}><MoreHorizontal size={18} /></button>
    </article>
  );
});
