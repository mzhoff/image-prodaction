'use client';

import { Bot, MessageSquareText, Send, X } from 'lucide-react';
import { useState } from 'react';
import { FeedbackPanel } from './feedback-panel';

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

type AssistantShellTab = 'assistant' | 'feedback';

const initialMessages: AssistantMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Я помогу собрать pipeline, найти нужную ноду или объяснить, что происходит на экране. Пока это локальный shell, backend подключим позже.',
  },
];

export function AssistantShell({ open, contextLabel, onClose }: AssistantShellProps) {
  const [activeTab, setActiveTab] = useState<AssistantShellTab>('assistant');
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
      aria-label="Assistant and feedback"
    >
      <header className="assistant-shell-header">
        <div className="assistant-shell-title">
          <span>
            {activeTab === 'assistant' ? <Bot size={18} /> : <MessageSquareText size={18} />}
          </span>
          <div>
            <strong>{activeTab === 'assistant' ? 'AI Assistant' : 'Feedback'}</strong>
            <small>{contextLabel}</small>
          </div>
        </div>
        <button type="button" aria-label="Close assistant" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="assistant-shell-tabs" role="tablist" aria-label="Assistant panel">
        <button
          aria-controls="assistant-shell-assistant-panel"
          aria-selected={activeTab === 'assistant'}
          onClick={() => setActiveTab('assistant')}
          role="tab"
          type="button"
        >
          Assistant
        </button>
        <button
          aria-controls="assistant-shell-feedback-panel"
          aria-selected={activeTab === 'feedback'}
          onClick={() => setActiveTab('feedback')}
          role="tab"
          type="button"
        >
          Feedback
        </button>
      </div>

      {activeTab === 'assistant' ? (
        <div
          aria-label="Assistant"
          className="assistant-shell-assistant-panel"
          id="assistant-shell-assistant-panel"
          role="tabpanel"
        >
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
        </div>
      ) : (
        <div
          aria-label="Feedback"
          className="assistant-shell-feedback-panel"
          id="assistant-shell-feedback-panel"
          role="tabpanel"
        >
          <FeedbackPanel contextLabel={contextLabel} />
        </div>
      )}
    </section>
  );
}
