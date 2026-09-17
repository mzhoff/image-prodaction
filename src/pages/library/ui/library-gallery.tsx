'use client';

import { MediaGallery } from '@prodactionpro/ui-media/client';
import { useMemo } from 'react';
import type { LibraryView } from '../lib/library-gallery';
import type { LibraryAssetItem } from '../model/types';
import { LibraryCard } from './library-card';

export function LibraryGallery({ items, view, filterQuery }: { items: LibraryAssetItem[]; view: LibraryView; filterQuery: string }) {
  const mediaItems = useMemo(() => items.map((item) => ({ ...item, url: item.contentUrl,
    name: item.originalName, kind: item.mediaKind, thumbnailUrl: item.thumbnailUrl ?? undefined,
  })), [items]);
  return <MediaGallery items={mediaItems} view={view} className="library-gallery" onSelect={ignoreSelection}
    renderCard={(item, width) => <LibraryCard item={item} filterQuery={filterQuery} width={width} />} />;
}

// Cards retain Next Link navigation and their existing context menu.
function ignoreSelection() {}
