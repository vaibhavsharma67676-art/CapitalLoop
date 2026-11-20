import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from '../assets/icons';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  wide?: boolean;
  dismissible?: boolean;
  onClose?: () => void;
  children: ReactNode;
}

export function ModalShell({
  title,
  subtitle,
  wide = false,
  dismissible = true,
  onClose,
  children,
}: ModalShellProps) {
  useEffect(() => {
    if (!dismissible || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismissible, onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (dismissible && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`modal-card ${wide ? 'wide' : ''}`}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {dismissible && onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
              <CloseIcon size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}