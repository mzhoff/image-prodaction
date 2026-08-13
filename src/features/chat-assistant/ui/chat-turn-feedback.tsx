'use client';

import { useEffect, useState } from 'react';
import { formatChatElapsed, normalizeChatActivityLabel } from '../model/chat-activity';

export function ChatActivityLabel({ active, statusLabel, toolActivityLabel }: {
  active: boolean;
  statusLabel?: string;
  toolActivityLabel?: string;
}) {
  const [startedAt, setStartedAt] = useState<number>();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setStartedAt(undefined);
      setElapsedMs(0);
      return undefined;
    }
    const started = Date.now();
    setStartedAt(started);
    setElapsedMs(0);
    const interval = window.setInterval(() => setElapsedMs(Date.now() - started), 1_000);
    return () => window.clearInterval(interval);
  }, [active]);

  if (!active) return null;
  return (
    <span className="image-production-chat-activity">
      <span>{toolActivityLabel ?? normalizeChatActivityLabel(statusLabel)}</span>
      <time aria-label={`Ассистент работает ${formatChatElapsed(elapsedMs)}`}>
        {formatChatElapsed(startedAt ? elapsedMs : 0)}
      </time>
    </span>
  );
}

export function ChatErrorRecovery({ canRetry, error, onRetry }: {
  canRetry: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="image-production-chat-error" role="alert">
      <span>{toUserError(error)}</span>
      {canRetry ? <button onClick={onRetry} type="button">Повторить запрос</button> : null}
    </div>
  );
}

function toUserError(error: string) {
  if (/timed out/i.test(error)) return 'Ассистент не успел завершить запрос. Проект не изменён.';
  if (/failed to fetch|network(?:\s+error| request failed)/i.test(error)) {
    return 'Ассистент не смог завершить запрос. Проект не изменён.';
  }
  if (/(?:status|http)\s*(?:502|503|504)\b/i.test(error)) {
    return 'Сервис ассистента временно недоступен. Проект не изменён.';
  }
  return error;
}
