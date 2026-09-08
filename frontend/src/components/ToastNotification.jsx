import { useState, useCallback } from 'react';

/**
 * Toast notification system.
 * Provides status-change notifications styled like SMS alerts.
 */

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((title, message, type = 'info') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, title, message, type }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.map(t =>
        t.id === id ? { ...t, exiting: true } : t
      ));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t =>
      t.id === id ? { ...t, exiting: true } : t
    ));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  return { toasts, addToast, removeToast };
}

const TYPE_ICONS = {
  info: '📋',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

export function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast ${toast.type} ${toast.exiting ? 'exiting' : ''}`}
        >
          <span className="toast-icon">{TYPE_ICONS[toast.type]}</span>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => onRemove(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
