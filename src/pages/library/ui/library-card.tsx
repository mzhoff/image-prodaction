'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, LibraryBig, Sparkles, Upload, Video } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import type { LibraryAssetItem, LibraryAssetOrigin } from '../model/types';

export const LibraryCard = memo(function LibraryCard({
  item,
  filterQuery,
}: {
  item: LibraryAssetItem;
  filterQuery: string;
}) {
  const previewHref = `/library/${encodeURIComponent(item.id)}${filterQuery ? `?${filterQuery}` : ''}`;
  const preferredPreviewUrl = item.thumbnailUrl || item.contentUrl;
  const [previewUrl, setPreviewUrl] = useState(preferredPreviewUrl);
  useEffect(() => setPreviewUrl(preferredPreviewUrl), [preferredPreviewUrl]);
  return (
    <article className="library-card">
      <Link href={previewHref} className="library-card-preview" aria-label={`Открыть ${item.originalName}`}>
        {item.mediaKind === 'image' && previewUrl ? <Image
          src={previewUrl}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, (max-width: 1200px) 33vw, 280px"
          unoptimized
          loading="lazy"
          decoding="async"
          onError={() => {
            if (previewUrl !== item.contentUrl) setPreviewUrl(item.contentUrl);
          }}
        /> : <span className="library-media-placeholder" aria-hidden="true">
          {item.mediaKind === 'video' ? <Video size={30} /> : <ImageIcon size={30} />}
        </span>}
        <span className={`library-origin-badge library-origin-${item.origin}`}>
          {originIcon(item.origin)} {originLabel(item.origin)}
        </span>
        {item.width && item.height ? <span className="library-dimensions">{item.width} × {item.height}</span> : null}
      </Link>
      <div className="library-card-body">
        <h3 title={item.originalName}>{item.originalName}</h3>
        <p>
          <span>{item.document?.name ?? 'Без проекта'}</span>
          <time dateTime={item.createdAt}>{formatLibraryDate(item.createdAt)}</time>
        </p>
        <div className="library-card-meta">
          <span>{item.modelId || item.provider || formatContentType(item.contentType)}</span>
          {item.operation ? <span>{item.operation}</span> : null}
        </div>
      </div>
    </article>
  );
});

function originLabel(origin: LibraryAssetOrigin) {
  if (origin === 'uploaded') return 'Uploaded';
  if (origin === 'generated') return 'Generated';
  if (origin === 'saved') return 'Saved';
  return 'Unknown';
}

function originIcon(origin: LibraryAssetOrigin) {
  if (origin === 'uploaded') return <Upload size={12} />;
  if (origin === 'generated') return <Sparkles size={12} />;
  return <LibraryBig size={12} />;
}

function formatLibraryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function formatContentType(value: string) {
  return value.split('/').pop()?.toUpperCase() || 'FILE';
}
