'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Download } from '@prodactionpro/ui-core/icons';
import { useState } from 'react';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

export function HomeResultVideo({ assetId }: { assetId: string }) {
  const tUi = useTranslations();
  const [failed, setFailed] = useState(false);
  const url = `/api/assets/${encodeURIComponent(assetId)}/content`;
  return <div className="home-video-media">
    <video src={url} controls playsInline preload="metadata" aria-label={tUi("Результат генерации видео")} onError={() => setFailed(true)} onLoadedMetadata={() => setFailed(false)} />
    <ProTooltip label={tUi("Скачать видео")} side="bottom"><a href={url} download={`reverie-${assetId}.mp4`} className="home-video-download" aria-label={tUi("Скачать видео")}><Download size={18} /></a></ProTooltip>
    {failed ? <p role="alert">{tUi("Не удалось воспроизвести видео. Попробуйте скачать файл или обновить страницу.")}</p> : null}
  </div>;
}
