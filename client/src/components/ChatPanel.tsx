import { CHAT_MAX_LENGTH, type ChatMessage } from '@capitalloop/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { SendIcon } from '../assets/icons';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<boolean>;
}

export function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const ok = await onSend(trimmed);
      if (ok) {
        setText('');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel-card chat-panel">
      <div className="section-heading">
        <span>Room Chat</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Private</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', marginTop: 12 }}>
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.isSystem ? 'system' : ''}`}>
              {!msg.isSystem && (
                <strong style={{ color: msg.senderColor, marginRight: 6 }}>{msg.senderName}:</strong>
              )}
              <span>{msg.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          type="text"
          className="input-field"
          placeholder="Say something..."
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          style={{ padding: '8px 10px', fontSize: '0.82rem' }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={sending || text.trim().length === 0}
          aria-label="Send chat message"
        >
          <SendIcon size={14} />
        </button>
      </form>
    </div>
  );
}