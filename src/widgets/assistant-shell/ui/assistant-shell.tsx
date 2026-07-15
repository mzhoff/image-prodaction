'use client';

import { Bot, Send, X } from 'lucide-react';
import { useState } from 'react';

interface AssistantShellProps {
  open: boolean;
  contextLabel: string;
  onClose: () => void;
}

interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

const initialMessages: AssistantMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Я помогу собрать pipeline, найти нужную ноду или объяснить, что происходит на экране. Пока это локальный shell, backend подключим позже.',
  },
];

export function AssistantShell({ open, contextLabel, onClose }: AssistantShellProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text },
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: 'Принял. В этой версии я показываю будущий UX чата. Следующий шаг - подключить реальный ChatModule API и контекст текущего проекта.',
      },
    ]);
    setValue('');
  };

  return (
    <section
      className={`assistant-shell ${open ? 'assistant-shell-open' : ''}`}
      aria-hidden={!open}
      aria-label="AI assistant chat"
    >
      <header className="assistant-shell-header">
        <div className="assistant-shell-title">
          <span>
            <Bot size={18} />
          </span>
          <div>
            <strong>AI Assistant</strong>
            <small>{contextLabel}</small>
          </div>
        </div>
        <button type="button" aria-label="Close assistant" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="assistant-shell-thread">
        {messages.map((message) => (
          <div className={`assistant-shell-message assistant-shell-message-${message.role}`} key={message.id}>
            {message.text}
          </div>
        ))}
      </div>
      <form
        className="assistant-shell-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Message assistant"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask about this product..."
        />
        <button type="submit" aria-label="Send message">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
