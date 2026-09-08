import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { myRequests } from "../api";
import StatusBadge from "../components/StatusBadge";
import Skeleton, { SkeletonCard } from "../components/Skeleton";
import Icon from "../components/Icon";

const URGENCY_COLOR = { Normal: "var(--info)", Urgent: "var(--warning)", Emergency: "var(--danger)" };
const TERMINAL = new Set(["Completed", "Cancelled", "Rejected"]);

export default function MyRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    myRequests()
      .then(setRequests)
      .catch(e => setErr(e.detail ?? "Failed to load requests."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 760 }}>
        <Skeleton height={28} width={200} style={{ marginBottom: "var(--sp-8)" }} />
        {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={4} />)}
      </div>
    );
  }

  if (err) {
    return (
      <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
        <div className="empty-state">
          <Icon name="alert-circle" size={40} color="var(--danger)" />
          <p style={{ fontWeight: 700 }}>{err}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()} style={{ marginTop: "var(--sp-3)" }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeCount = requests.filter(r => !TERMINAL.has(r.status)).length;
  const filteredRequests = requests.filter(r => {
    if (filter === "active") return !TERMINAL.has(r.status);
    if (filter === "completed") return r.status === "Completed";
    if (filter === "cancelled") return r.status === "Cancelled" || r.status === "Rejected";
    return true;
  });

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--sp-6)", flexWrap: "wrap", gap: "var(--sp-4)" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>My Service Requests</h1>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
            Track live progress, review past invoices, and rate completed jobs
          </p>
        </div>
        <Link to="/book" className="btn btn-primary" style={{ gap: 6 }}>
          <Icon name="plus" size={15} />
          <span>New Booking</span>
        </Link>
      </div>

      {/* Filter Tabs */}
      {requests.length > 0 && (
        <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-6)", overflowX: "auto", paddingBottom: 2 }}>
          {[
            { id: "all", label: "All Bookings", count: requests.length },
            { id: "active", label: "In Progress / Active", count: activeCount },
            { id: "completed", label: "Completed", count: requests.filter(r => r.status === "Completed").length },
          ].map(tab => (
            <button
              key={tab.id}
              className={`btn btn-sm ${filter === tab.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilter(tab.id)}
              style={{ gap: 6, borderRadius: "var(--r-full)" }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: 10, opacity: 0.85, padding: "0 5px", background: filter === tab.id ? "rgba(255,255,255,0.25)" : "var(--surface-hover)", borderRadius: 999 }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Request List */}
      {filteredRequests.length === 0 ? (
        <div className="empty-state" style={{ background: "var(--surface-raised)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
          <Icon name="clipboard" size={48} color="var(--text-muted)" />
          <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginTop: "var(--sp-3)" }}>
            {filter === "all" ? "No service requests yet" : `No ${filter} requests`}
          </p>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--sp-4)" }}>
            Need help around the house? Book a verified technician in seconds.
          </p>
          <Link to="/book" className="btn btn-primary">Book a Service Now</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {filteredRequests.map(r => (
            <Link
              key={r.id}
              to={`/track/${r.id}`}
              className="card job-card"
              style={{ textDecoration: "none", color: "inherit", border: "1px solid var(--border)", transition: "all 200ms var(--ease)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-4)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>{r.service_type ?? "Service"}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: URGENCY_COLOR[r.urgency] ?? "var(--text-muted)", padding: "1px 7px", borderRadius: 999, background: `${URGENCY_COLOR[r.urgency]}18` }}>
                      {r.urgency}
                    </span>
                  </div>
                  {r.problem_details && (
                    <p className="text-muted" style={{ fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.problem_details}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-2)", fontSize: "var(--text-xs)", color: "var(--text-muted)", flexWrap: "wrap" }}>
                    <span>👤 {r.provider_name ? r.provider_name : "Matching provider..."}</span>
                    {r.date && <span>📅 {r.date}</span>}
                    {r.time_slot && <span>⏰ {r.time_slot}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--sp-3)", flexShrink: 0 }}>
                  <StatusBadge status={r.status} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--a-500)", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                    Track live <Icon name="chevron-right" size={13} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
