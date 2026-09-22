'use client';

import { useState } from 'react';
import type { LegacyChatAttachment } from '@prodactionpro/chat-domain';
import { UserRound } from '@prodactionpro/ui-core/icons';
import styles from './home-message-subject-preview.module.css';

export function HomeMessageSubjectPreview({ attachment }: { attachment: LegacyChatAttachment }) {
  const [failed, setFailed] = useState(false);
  if (!attachment.id.startsWith('home-subject:') || !attachment.url?.startsWith('/api/assets/')) return null;
  return <figure className={styles.subject}>
    {failed ? <span className={styles.unavailable}><UserRound size={24} /></span>
      : <img src={attachment.url} alt={attachment.name} onError={() => setFailed(true)} draggable={false} />}
    <figcaption>{attachment.name}</figcaption>
  </figure>;
}
