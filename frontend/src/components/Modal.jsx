import { useRef } from "react";
import Icon from "./Icon";

export default function Modal({ open, onClose, title, children, footer }) {
  const backdropRef = useRef(null);

  if (!open) return null;

  function handleBackdrop(e) {
    if (e.target === backdropRef.current) onClose?.();
  }

  return (
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal">
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          <button
            className="btn btn-ghost"
            style={{ width: 40, height: 40, padding: 0 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
