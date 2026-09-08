import { useState, useEffect } from "react";
import { getNotifications, markNotificationsRead } from "../api";
import { useAuth } from "../context/AuthContext";
import Skeleton from "../components/Skeleton";
import Icon from "../components/Icon";

function parseUTCDate(iso) {
  if (!iso) return null;
  if (typeof iso === "string") {
    const s = iso.trim();
    // If the string lacks a timezone specifier ('Z' or +HH:MM / -HH:MM), treat as UTC
    if (!s.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
      return new Date(s.replace(" ", "T") + "Z");
    }
    return new Date(s);
  }
  return new Date(iso);
}

function timeAgo(iso) {
  const d = parseUTCDate(iso);
  if (!d || isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatFullDate(iso) {
  const d = parseUTCDate(iso);
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export default function Notifications() {
  const { clearUnread } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  // Keep relative times ("just now", "1m ago", etc.) fresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getNotifications()
      .then(data => {
        setNotifs(data);
        const unreadIds = data.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length) {
          markNotificationsRead(unreadIds).then(() => clearUnread());
        }
      })
      .finally(() => setLoading(false));
  }, [clearUnread]);

  const ICON_MAP = {
    success: "check-circle",
    info: "refresh-cw",
    warning: "alert-circle",
    error: "x-circle",
  };

  const KIND_COLOR = {
    success: "var(--success)",
    info: "var(--accent)",
    warning: "var(--warning)",
    error: "var(--danger)",
  };

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 680 }}>
      <h1 style={{ marginBottom: "var(--sp-8)" }}>Notifications</h1>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: "var(--sp-4)", padding: "var(--sp-4)" }}>
              <Skeleton width={40} height={40} borderRadius="50%" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <Skeleton height={14} width="80%" style={{ marginBottom: "var(--sp-2)" }} />
                <Skeleton height={12} width="60%" style={{ marginBottom: "var(--sp-2)" }} />
                <Skeleton height={12} width="40%" />
              </div>
            </div>
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="empty-state">
          <Icon name="bell-off" size={48} color="var(--text-muted)" />
          <p style={{ fontWeight: 600 }}>No notifications yet</p>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
            Updates about your bookings will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          {notifs.map(n => (
            <div
              key={n.id}
              className="card"
              style={{
                display: "flex", gap: "var(--sp-4)", padding: "var(--sp-4)",
                background: n.read ? "var(--surface)" : "var(--accent-subtle)",
                borderColor: n.read ? "var(--border)" : "var(--accent)",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: "var(--surface-raised)", display: "grid", placeItems: "center",
              }}>
                <Icon name={ICON_MAP[n.kind] ?? "bell"} size={18} color={KIND_COLOR[n.kind] ?? "var(--accent)"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: n.read ? 400 : 600, marginBottom: 2 }}>{n.title}</p>
                {n.body && (
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--sp-1)", lineHeight: 1.4 }}>{n.body}</p>
                )}
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title={formatFullDate(n.created_at)}>{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 6 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
