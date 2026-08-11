'use client';

import type { ChatMessage } from '@prodactionpro/chat-domain';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  formatChatMessageTime,
  getChatMessageCopyText,
} from '../model/chat-message-actions';

interface ChatMessageHoverActionsProps {
  hostRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
}

export function ChatMessageHoverActions({ hostRef, messages }: ChatMessageHoverActionsProps) {
  const messageIds = messages.map((message) => message.id).join('\u001f');
  const [targets, setTargets] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const syncTargets = () => {
      const nextTargets = readMessageTargets(host);
      setTargets((currentTargets) => (
        haveSameTargets(currentTargets, nextTargets) ? currentTargets : nextTargets
      ));
    };
    const observer = new MutationObserver(syncTargets);
    observer.observe(host, { childList: true, subtree: true });
    syncTargets();

    return () => observer.disconnect();
  }, [hostRef, messageIds]);

  return targets.map((target, index) => {
    const message = messages[index];
    if (!message || !isRegularConversationMessage(target)) return null;

    return createPortal(
      <MessageActions message={message} />,
      target,
      `image-production-message-actions-${message.id}`,
    );
  });
}

function MessageActions({ message }: { message: ChatMessage }) {
  const copyText = getChatMessageCopyText(message);
  const messageTime = formatChatMessageTime(message.createdAt);
  const [isCopied, setIsCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const handleCopy = async () => {
    if (!copyText) return;

    try {
      await writeTextToClipboard(copyText);
      setIsCopied(true);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => setIsCopied(false), 1_200);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <div className="image-production-chat-message-actions">
      {copyText ? (
        <button
          aria-label={isCopied ? 'Сообщение скопировано' : 'Копировать сообщение'}
          className="image-production-chat-message-copy"
          onClick={() => { void handleCopy(); }}
          title={isCopied ? 'Скопировано' : 'Копировать'}
          type="button"
        >
          {isCopied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        </button>
      ) : null}
      {messageTime ? <time dateTime={message.createdAt}>{messageTime}</time> : null}
    </div>
  );
}

function isMessageElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.classList.contains('cm-message');
}

function readMessageTargets(host: HTMLElement) {
  const messageStack = host.querySelector<HTMLElement>('.cm-message-stack');
  return messageStack
    ? Array.from(messageStack.children).filter(isMessageElement)
    : [];
}

function isRegularConversationMessage(element: HTMLElement) {
  return element.dataset.authorType === 'assistant' || element.dataset.authorType === 'user';
}

function haveSameTargets(currentTargets: HTMLElement[], nextTargets: HTMLElement[]) {
  return currentTargets.length === nextTargets.length
    && currentTargets.every((target, index) => target === nextTargets[index]);
}

async function writeTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed');
}
