import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "../components/Icon";

const ToastContext = createContext(null);

let _nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, kind = "info", duration = 4000) => {
    const id = _nextId++;
    let text = message;
    if (typeof text !== "string") {
      if (Array.isArray(text)) {
        text = text.map(item => (typeof item === "string" ? item : item?.msg || item?.message || JSON.stringify(item))).join(", ");
      } else if (text && typeof text === "object") {
        text = text.message || text.detail || JSON.stringify(text);
      } else {
        text = String(text ?? "");
      }
    }
    setToasts(ts => [...ts, { id, message: text, kind }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const success = useCallback((msg, d) => toast(msg, "success", d), [toast]);
  const error   = useCallback((msg, d) => toast(msg, "error",   d), [toast]);
  const warning = useCallback((msg, d) => toast(msg, "warning", d), [toast]);
  const info    = useCallback((msg, d) => toast(msg, "info",    d), [toast]);

  const ICONS = { success: "check-circle", error: "x-circle", warning: "alert-circle", info: "info" };
  const COLORS = { success: "var(--success)", error: "var(--danger)", warning: "var(--warning)", info: "var(--info)" };

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="alert">
            <Icon name={ICONS[t.kind]} size={18} color={COLORS[t.kind]} strokeWidth={2} />
            <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{t.message}</span>
            <button
              className="btn-ghost"
              style={{ height: 28, width: 28, padding: 0, borderRadius: "var(--r-sm)", minWidth: 0 }}
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}
