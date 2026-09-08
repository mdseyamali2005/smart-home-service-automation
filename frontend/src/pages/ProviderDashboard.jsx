import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { myStats, myJobs } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import Skeleton from "../components/Skeleton";
import Icon from "../components/Icon";

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
      <div style={{ width: 48, height: 48, borderRadius: "var(--r-md)", background: `${color}18`, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={22} color={color} />
      </div>
      <div>
        <p style={{ fontSize: "var(--text-2xl)", fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 500 }}>{label}</p>
      </div>
    </div>
  );
}

export default function ProviderDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([myStats(), myJobs()])
      .then(([s, j]) => { setStats(s); setJobs(j.slice(0, 5)); })
      .finally(() => setLoading(false));
  }, []);

  const URGENCY_COLOR = { Normal: "var(--info)", Urgent: "var(--warning)", Emergency: "var(--danger)" };

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
      <div style={{ marginBottom: "var(--sp-8)" }}>
        <h1>Dashboard</h1>
        <p className="text-muted" style={{ marginTop: "var(--sp-1)" }}>Welcome back, {user?.name}</p>
      </div>

      {/* Quick nav */}
      <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-8)" }}>
        <Link to="/provider/jobs" className="btn btn-secondary btn-sm">
          <Icon name="briefcase" size={14} /> My Jobs
        </Link>
        <Link to="/provider/availability" className="btn btn-secondary btn-sm">
          <Icon name="calendar" size={14} /> Availability
        </Link>
        <Link to="/provider/profile" className="btn btn-secondary btn-sm">
          <Icon name="user" size={14} /> Profile
        </Link>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="stat-grid" style={{ "--cols": 2, marginBottom: "var(--sp-8)" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
              <Skeleton width={48} height={48} borderRadius="var(--r-md)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <Skeleton height={20} width="60%" style={{ marginBottom: "var(--sp-2)" }} />
                <Skeleton height={12} width="40%" />
              </div>
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="stat-grid" style={{ "--cols": 2, marginBottom: "var(--sp-8)" }}>
          <StatCard label="Total jobs" value={stats.total_jobs ?? 0} icon="briefcase" color="var(--accent)" />
          <StatCard label="Completed" value={stats.completed ?? 0} icon="check-circle" color="var(--success)" />
          <StatCard label="Avg rating" value={stats.average_rating ? stats.average_rating.toFixed(1) : "—"} icon="star" color="var(--warning)" />
          <StatCard label="Earnings (BDT)" value={stats.total_earnings ? `৳${stats.total_earnings.toLocaleString()}` : "৳0"} icon="credit-card" color="var(--info)" />
        </div>
      )}

      {/* Recent jobs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
        <h2 style={{ fontSize: "var(--text-lg)" }}>Recent jobs</h2>
        <Link to="/provider/jobs" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          View all <Icon name="chevron-right" size={14} />
        </Link>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <Skeleton height={14} width="50%" style={{ marginBottom: "var(--sp-2)" }} />
                <Skeleton height={12} width="30%" />
              </div>
              <Skeleton height={24} width={80} borderRadius="var(--r-full)" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <Icon name="briefcase" size={40} color="var(--text-muted)" />
          <p>No jobs yet. Publish your availability to start receiving requests.</p>
          <Link to="/provider/availability" className="btn btn-primary">Set up availability</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {jobs.map(j => (
            <div key={j.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-4)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{j.service_type ?? "Service"}</p>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                  {j.customer_name} · <span style={{ color: URGENCY_COLOR[j.urgency] }}>{j.urgency}</span>
                  {j.date && ` · ${j.date}`}
                </p>
              </div>
              <StatusBadge status={j.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
