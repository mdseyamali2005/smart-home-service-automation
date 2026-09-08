import { useState, useEffect, useCallback } from "react";
import {
  getAdminStats,
  getAdminUsers,
  toggleBanUser,
  getPendingProviders,
  approveProvider,
  rejectProvider,
  getAdminDisputes,
  resolveAdminDispute,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";

export default function AdminDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState("overview"); // "overview" | "disputes" | "providers" | "users"
  const [stats, setStats] = useState(null);
  const [pendingProviders, setPendingProviders] = useState([]);
  const [users, setUsers] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [disputeFilter, setDisputeFilter] = useState("all"); // "all" | "pending" | "resolved"
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Dispute resolution modal state
  const [resolvingDispute, setResolvingDispute] = useState(null);
  const [resolveAction, setResolveAction] = useState("release"); // "release" | "refund"
  const [adminNote, setAdminNote] = useState("");
  const [previewImage, setPreviewImage] = useState(null);

  // Load platform stats
  const loadStats = useCallback(() => {
    setLoadingStats(true);
    getAdminStats()
      .then(data => setStats(data))
      .catch(err => toast.error(err.message || "Failed to load platform stats"))
      .finally(() => setLoadingStats(false));
  }, [toast]);

  // Load pending provider applications
  const loadPending = useCallback(() => {
    setLoadingProviders(true);
    getPendingProviders()
      .then(data => setPendingProviders(data))
      .catch(err => toast.error(err.message || "Failed to load pending providers"))
      .finally(() => setLoadingProviders(false));
  }, [toast]);

  // Load customer disputes & reports
  const loadDisputes = useCallback(() => {
    setLoadingDisputes(true);
    getAdminDisputes()
      .then(data => setDisputes(data))
      .catch(err => toast.error(err.message || "Failed to load customer disputes"))
      .finally(() => setLoadingDisputes(false));
  }, [toast]);

  // Load users
  const loadUsers = useCallback(() => {
    setLoadingUsers(true);
    getAdminUsers(userRoleFilter || undefined, userSearch || undefined)
      .then(data => setUsers(data))
      .catch(err => toast.error(err.message || "Failed to load users"))
      .finally(() => setLoadingUsers(false));
  }, [userRoleFilter, userSearch, toast]);

  useEffect(() => {
    loadStats();
    loadPending();
    loadDisputes();
  }, [loadStats, loadPending, loadDisputes]);

  useEffect(() => {
    if (tab === "users") {
      loadUsers();
    } else if (tab === "disputes") {
      loadDisputes();
    }
  }, [tab, loadUsers, loadDisputes]);

  // Handle Provider Approval
  const handleApprove = async (providerId, name) => {
    setActionLoadingId(providerId);
    try {
      await approveProvider(providerId);
      toast.success(`Provider "${name}" approved successfully!`);
      setPendingProviders(prev => prev.filter(p => p.provider_id !== providerId));
      loadStats();
    } catch (err) {
      toast.error(err.message || "Failed to approve provider");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Provider Rejection
  const handleReject = async (providerId, name) => {
    if (!window.confirm(`Are you sure you want to reject the application for "${name}"?`)) return;
    setActionLoadingId(providerId);
    try {
      await rejectProvider(providerId);
      toast.warning(`Application for "${name}" rejected.`);
      setPendingProviders(prev => prev.filter(p => p.provider_id !== providerId));
      loadStats();
    } catch (err) {
      toast.error(err.message || "Failed to reject provider");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle User Ban Toggle
  const handleToggleBan = async (targetUser) => {
    const action = targetUser.is_banned ? "unban" : "ban";
    if (!window.confirm(`Are you sure you want to ${action} ${targetUser.name}?`)) return;

    setActionLoadingId(targetUser.id);
    try {
      const res = await toggleBanUser(targetUser.id);
      toast.info(res.message);
      setUsers(prev =>
        prev.map(u => (u.id === targetUser.id ? { ...u, is_banned: !u.is_banned } : u))
      );
      loadStats();
    } catch (err) {
      toast.error(err.message || `Failed to ${action} user`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Dispute Resolution
  const handleResolveDispute = async () => {
    if (!resolvingDispute) return;
    setActionLoadingId(resolvingDispute.id);
    try {
      await resolveAdminDispute(resolvingDispute.id, {
        action: resolveAction,
        admin_note: adminNote.trim(),
      });
      toast.success(
        resolveAction === "release"
          ? "Payment released to provider! Customer and provider notified."
          : "Full refund issued to customer! Provider slot freed."
      );
      setResolvingDispute(null);
      setAdminNote("");
      loadDisputes();
      loadStats();
    } catch (err) {
      toast.error(err.message || "Failed to resolve dispute");
    } finally {
      setActionLoadingId(null);
    }
  };

  const maxIncome = stats?.income_by_day
    ? Math.max(...stats.income_by_day.map(d => d.amount), 100)
    : 100;
  const total7DayIncome = stats?.income_by_day
    ? stats.income_by_day.reduce((sum, d) => sum + (d.amount || 0), 0)
    : 0;

  const pendingDisputesCount = stats?.disputed_requests ?? disputes.filter(d => d.status === "Disputed").length;

  return (
    <div className="container" style={{ padding: "var(--sp-8) var(--sp-4)", maxWidth: 1100 }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: "var(--sp-4)",
        marginBottom: "var(--sp-8)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-1)" }}>
            <span style={{
              background: "var(--accent-subtle)",
              color: "var(--accent)",
              padding: "2px 8px",
              borderRadius: "var(--r-full)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              Platform Administration
            </span>
          </div>
          <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>Admin Command Center</h1>
          <p className="text-muted" style={{ marginTop: "var(--sp-1)" }}>
            Logged in as {user?.name} ({user?.email})
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            loadStats();
            if (tab === "disputes") loadDisputes();
            if (tab === "providers") loadPending();
            if (tab === "users") loadUsers();
          }}
          title="Refresh data"
        >
          <Icon name="refresh-cw" size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "var(--sp-2)",
        borderBottom: "1px solid var(--border)",
        marginBottom: "var(--sp-8)",
        overflowX: "auto",
        paddingBottom: 2,
      }}>
        <button
          onClick={() => setTab("overview")}
          className="btn"
          style={{
            background: tab === "overview" ? "var(--surface-raised)" : "transparent",
            color: tab === "overview" ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === "overview" ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: "var(--r-md) var(--r-md) 0 0",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
          }}
        >
          <Icon name="activity" size={16} /> Platform & Income
        </button>

        <button
          onClick={() => { setTab("disputes"); loadDisputes(); }}
          className="btn"
          style={{
            background: tab === "disputes" ? "var(--surface-raised)" : "transparent",
            color: tab === "disputes" ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === "disputes" ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: "var(--r-md) var(--r-md) 0 0",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
          }}
        >
          <Icon name="alert-circle" size={16} />
          Disputes & Escrow
          {pendingDisputesCount > 0 && (
            <span style={{
              background: "var(--danger)",
              color: "#fff",
              padding: "1px 6px",
              borderRadius: "var(--r-full)",
              fontSize: "var(--text-xs)",
              fontWeight: 800,
            }}>
              {pendingDisputesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => { setTab("providers"); loadPending(); }}
          className="btn"
          style={{
            background: tab === "providers" ? "var(--surface-raised)" : "transparent",
            color: tab === "providers" ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === "providers" ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: "var(--r-md) var(--r-md) 0 0",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
          }}
        >
          <Icon name="check-circle" size={16} />
          Provider Requests
          {pendingProviders.length > 0 && (
            <span style={{
              background: "var(--warning)",
              color: "#000",
              padding: "1px 6px",
              borderRadius: "var(--r-full)",
              fontSize: "var(--text-xs)",
              fontWeight: 800,
            }}>
              {pendingProviders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setTab("users"); loadUsers(); }}
          className="btn"
          style={{
            background: tab === "users" ? "var(--surface-raised)" : "transparent",
            color: tab === "users" ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === "users" ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: "var(--r-md) var(--r-md) 0 0",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
          }}
        >
          <Icon name="users" size={16} /> User Management & Bans
          {stats?.banned_users > 0 && (
            <span style={{
              background: "var(--danger)",
              color: "#fff",
              padding: "1px 6px",
              borderRadius: "var(--r-full)",
              fontSize: "var(--text-xs)",
              fontWeight: 800,
            }}>
              {stats.banned_users} banned
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: OVERVIEW & INCOME ── */}
      {tab === "overview" && (
        <div>
          {loadingStats ? (
            <div className="stat-grid" style={{ "--cols": 5, marginBottom: "var(--sp-8)" }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="card" style={{ height: 100, padding: "var(--sp-4)" }}>
                  <Skeleton height={20} width="40%" style={{ marginBottom: "var(--sp-2)" }} />
                  <Skeleton height={32} width="70%" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="stat-grid" style={{ "--cols": 5, marginBottom: "var(--sp-8)" }}>
                {/* Total Platform Income */}
                <div className="card" style={{
                  background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-raised) 100%)",
                  border: "1px solid var(--accent)",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", top: -10, right: -10,
                    width: 70, height: 70, borderRadius: "50%",
                    background: "var(--accent-subtle)", opacity: 0.5,
                  }} />
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase" }}>
                    Platform Revenue
                  </p>
                  <p style={{ fontSize: "var(--text-3xl)", fontWeight: 800, margin: "var(--sp-1) 0" }}>
                    ৳ {stats?.total_income?.toLocaleString() || 0}
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    From completed service jobs
                  </p>
                </div>

                {/* Job Requests */}
                <div className="card">
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600 }}>
                    Service Requests
                  </p>
                  <p style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--sp-1) 0" }}>
                    {stats?.completed_requests ?? 0} <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>/ {stats?.total_requests ?? 0}</span>
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--success)" }}>
                    {stats?.active_requests ?? 0} currently active
                  </p>
                </div>

                {/* Customer Disputes Card */}
                <div
                  className="card"
                  onClick={() => { setTab("disputes"); loadDisputes(); }}
                  style={{
                    cursor: "pointer",
                    border: (pendingDisputesCount > 0) ? "1.5px solid var(--danger)" : "1px solid var(--border)",
                    background: (pendingDisputesCount > 0) ? "var(--danger-bg)" : "var(--surface-raised)",
                    transition: "transform 0.15s ease",
                  }}
                  title="Click to manage escrow dispute claims"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: "var(--text-xs)", color: (pendingDisputesCount > 0) ? "var(--danger)" : "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                      Dispute Claims
                    </p>
                    <Icon name="alert-circle" size={14} color={pendingDisputesCount > 0 ? "var(--danger)" : "var(--text-muted)"} />
                  </div>
                  <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800, margin: "var(--sp-1) 0", color: pendingDisputesCount > 0 ? "var(--danger)" : "inherit" }}>
                    {pendingDisputesCount}
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: pendingDisputesCount > 0 ? "var(--danger)" : "var(--text-muted)", fontWeight: 600 }}>
                    {pendingDisputesCount > 0 ? "⚠️ Review & Arbitrate" : "Escrow protected"}
                  </p>
                </div>

                {/* Service Providers */}
                <div className="card">
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600 }}>
                    Active Providers
                  </p>
                  <p style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--sp-1) 0" }}>
                    {stats?.total_providers ?? 0}
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: stats?.pending_providers ? "var(--warning)" : "var(--text-muted)" }}>
                    {stats?.pending_providers ?? 0} pending review
                  </p>
                </div>

                {/* Users & Bans */}
                <div className="card">
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600 }}>
                    Total Users
                  </p>
                  <p style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "var(--sp-1) 0" }}>
                    {stats?.total_users ?? 0}
                  </p>
                  <p style={{ fontSize: "var(--text-xs)", color: stats?.banned_users ? "var(--danger)" : "var(--text-muted)" }}>
                    {stats?.banned_users ?? 0} suspended
                  </p>
                </div>
              </div>

              {/* 7-Day Revenue Trend Chart */}
              <div className="card" style={{ padding: "var(--sp-6)", marginBottom: "var(--sp-8)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-6)", flexWrap: "wrap", gap: "var(--sp-2)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>7-Day Revenue Trend</h3>
                      <span style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: 700,
                        background: "var(--accent-subtle)",
                        color: "var(--accent)",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        border: "1px solid var(--accent)",
                      }}>
                        Total: ৳{total7DayIncome.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-muted" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                      Daily earnings recorded from completed job invoices
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(180deg, var(--accent) 0%, var(--accent-hover) 100%)", display: "inline-block" }} />
                      <span>Revenue</span>
                    </div>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-hover)", padding: "3px 8px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                      Last 7 Days
                    </span>
                  </div>
                </div>

                {/* Chart Outer Container */}
                <div style={{ position: "relative", width: "100%" }}>
                  {/* Background Grid Guide Lines */}
                  <div style={{
                    position: "absolute",
                    top: 28,
                    left: 0,
                    right: 0,
                    height: 140,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    pointerEvents: "none",
                    zIndex: 0,
                  }}>
                    <div style={{ borderBottom: "1px dashed var(--border)", width: "100%", opacity: 0.6 }} />
                    <div style={{ borderBottom: "1px dashed var(--border)", width: "100%", opacity: 0.4 }} />
                    <div style={{ borderBottom: "1px solid var(--border)", width: "100%", opacity: 0.8 }} />
                  </div>

                  {/* Bars Container */}
                  <div style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "stretch",
                    gap: "var(--sp-3)",
                    height: 180,
                    padding: "0 var(--sp-2)",
                  }}>
                    {stats?.income_by_day?.map(day => {
                      const amount = day.amount || 0;
                      const hasIncome = amount > 0;
                      const heightPercent = hasIncome
                        ? Math.min(Math.max(Math.round((amount / maxIncome) * 100), 12), 100)
                        : 0;

                      const dateObj = new Date(day.date + "T00:00:00");
                      const dayName = isNaN(dateObj.getTime())
                        ? ""
                        : dateObj.toLocaleDateString("en-US", { weekday: "short" });

                      return (
                        <div
                          key={day.date}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            height: "100%",
                          }}
                        >
                          {/* Value label row */}
                          <div style={{
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 4,
                          }}>
                            {hasIncome ? (
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#ffffff",
                                background: "var(--accent)",
                                padding: "2px 7px",
                                borderRadius: "var(--r-sm)",
                                boxShadow: "0 2px 4px rgba(99, 102, 241, 0.25)",
                                whiteSpace: "nowrap",
                              }}>
                                ৳{amount.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--text-faint)",
                              }}>
                                ৳0
                              </span>
                            )}
                          </div>

                          {/* Bar Track Area */}
                          <div style={{
                            flex: 1,
                            width: "100%",
                            maxWidth: 48,
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                            position: "relative",
                            borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                            background: "hsla(242, 60%, 50%, 0.04)",
                            border: "1px solid hsla(242, 60%, 50%, 0.08)",
                            borderBottom: "none",
                            transition: "all 0.2s ease",
                          }}
                            title={`${day.date} (${dayName}): ৳${amount.toLocaleString()}`}
                          >
                            {/* The Bar */}
                            <div
                              style={{
                                width: "100%",
                                height: hasIncome ? `${heightPercent}%` : "6px",
                                minHeight: "6px",
                                background: hasIncome
                                  ? "linear-gradient(180deg, var(--accent) 0%, var(--accent-hover) 100%)"
                                  : "var(--border)",
                                borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                                transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s ease",
                                boxShadow: hasIncome ? "0 2px 8px rgba(99, 102, 241, 0.35)" : "none",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* X-Axis Baseline Rule */}
                  <div style={{
                    width: "100%",
                    height: 2,
                    background: "var(--border)",
                  }} />

                  {/* Date labels Row (below baseline) */}
                  <div style={{
                    display: "flex",
                    gap: "var(--sp-3)",
                    padding: "8px var(--sp-2) 0",
                  }}>
                    {stats?.income_by_day?.map(day => {
                      const dateObj = new Date(day.date + "T00:00:00");
                      const dayName = isNaN(dateObj.getTime())
                        ? ""
                        : dateObj.toLocaleDateString("en-US", { weekday: "short" });

                      return (
                        <div
                          key={day.date}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            textAlign: "center",
                          }}
                        >
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--text-body)",
                            lineHeight: 1.2,
                          }}>
                            {dayName}
                          </span>
                          <span style={{
                            fontSize: "10px",
                            color: "var(--text-muted)",
                            lineHeight: 1.2,
                            marginTop: 2,
                          }}>
                            {day.date.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Quick Summary Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--sp-4)" }}>
                <div className="card" style={{ padding: "var(--sp-5)" }}>
                  <h4 style={{ fontWeight: 700, marginBottom: "var(--sp-3)" }}>Account Breakdown</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", fontSize: "var(--text-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="text-muted">Customers</span>
                      <span style={{ fontWeight: 600 }}>{stats?.total_customers ?? 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="text-muted">Service Providers</span>
                      <span style={{ fontWeight: 600 }}>{stats?.total_providers ?? 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="text-muted">Administrators</span>
                      <span style={{ fontWeight: 600 }}>{stats?.total_admins ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: "var(--sp-5)" }}>
                  <h4 style={{ fontWeight: 700, marginBottom: "var(--sp-3)" }}>Approval Queue</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", fontSize: "var(--text-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="text-muted">Pending Applications</span>
                      <span style={{ fontWeight: 700, color: stats?.pending_providers ? "var(--warning)" : "var(--success)" }}>
                        {stats?.pending_providers ?? 0}
                      </span>
                    </div>
                    {stats?.pending_providers > 0 && (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: "var(--sp-2)" }}
                        onClick={() => { setTab("providers"); loadPending(); }}
                      >
                        Review Applications Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: DISPUTES & ESCROW ARBITRATION ── */}
      {tab === "disputes" && (
        <div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "var(--sp-6)",
            flexWrap: "wrap",
            gap: "var(--sp-4)",
          }}>
            <div>
              <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Customer Disputes & Escrow Arbitration</h2>
              <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
                Review customer problem reports, inspect evidence photos, and arbitrate whether to release escrow funds or refund the customer.
              </p>
            </div>

            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              <button
                className={`btn btn-sm ${disputeFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setDisputeFilter("all")}
              >
                All Cases ({disputes.length})
              </button>
              <button
                className={`btn btn-sm ${disputeFilter === "pending" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setDisputeFilter("pending")}
              >
                Needs Action ({disputes.filter(d => d.status === "Disputed").length})
              </button>
              <button
                className={`btn btn-sm ${disputeFilter === "resolved" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setDisputeFilter("resolved")}
              >
                Resolved ({disputes.filter(d => d.status !== "Disputed").length})
              </button>
            </div>
          </div>

          {loadingDisputes ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="card" style={{ height: 160, padding: "var(--sp-5)" }}>
                  <Skeleton height={24} width="40%" style={{ marginBottom: "var(--sp-3)" }} />
                  <Skeleton height={16} width="70%" style={{ marginBottom: "var(--sp-3)" }} />
                  <Skeleton height={48} width="100%" />
                </div>
              ))}
            </div>
          ) : (
            (() => {
              const activeDisputes = disputes.filter(d => d.status === "Disputed");
              const resolvedDisputes = disputes.filter(d => d.status !== "Disputed");
              const displayed =
                disputeFilter === "pending"
                  ? activeDisputes
                  : disputeFilter === "resolved"
                  ? resolvedDisputes
                  : disputes;

              if (displayed.length === 0) {
                return (
                  <div className="card" style={{ textAlign: "center", padding: "var(--sp-12)" }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: "50%",
                      background: "var(--success-subtle, #dcfce7)",
                      display: "grid", placeItems: "center", margin: "0 auto var(--sp-4)",
                    }}>
                      <Icon name="check-circle" size={32} color="var(--success)" />
                    </div>
                    <h3 style={{ fontWeight: 700, marginBottom: "var(--sp-2)" }}>
                      {disputeFilter === "pending" ? "No Active Disputes Pending Review" : "No Dispute Records"}
                    </h3>
                    <p className="text-muted" style={{ fontSize: "var(--text-sm)", maxWidth: 460, margin: "0 auto" }}>
                      {disputeFilter === "pending"
                        ? "All customer bookings are running normally. When a customer files a dispute against a service, it will appear here for Admin review."
                        : "No service requests have dispute records."}
                    </p>
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
                  {displayed.map(d => {
                    const isPending = d.status === "Disputed";
                    const isResolvedRelease = d.payment_status === "released" || d.status === "Completed";

                    return (
                      <div
                        key={d.id}
                        className="card"
                        style={{
                          padding: "var(--sp-5)",
                          border: isPending ? "2px solid var(--danger)" : "1px solid var(--border)",
                          boxShadow: isPending ? "var(--shadow-md)" : "var(--shadow-sm)",
                        }}
                      >
                        {/* Header row */}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          gap: "var(--sp-3)",
                          borderBottom: "1px solid var(--border)",
                          paddingBottom: "var(--sp-3)",
                          marginBottom: "var(--sp-4)",
                        }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, fontSize: "var(--text-base)" }}>Booking #{d.id.slice(-6)}</span>
                              <span style={{
                                background: "var(--accent-subtle)",
                                color: "var(--accent)",
                                padding: "2px 8px",
                                borderRadius: "var(--r-full)",
                                fontSize: "var(--text-xs)",
                                fontWeight: 700,
                              }}>
                                {d.service_type}
                              </span>
                              <span style={{
                                fontSize: "var(--text-xs)",
                                fontWeight: 700,
                                color: d.urgency === "Emergency" ? "var(--danger)" : d.urgency === "Urgent" ? "var(--warning)" : "var(--info)",
                                padding: "2px 8px",
                                borderRadius: "var(--r-full)",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                              }}>
                                {d.urgency}
                              </span>
                            </div>
                            <p className="text-muted" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                              Scheduled: {d.date} at {d.time_slot}
                              {d.dispute_created_at && ` · Dispute filed: ${new Date(d.dispute_created_at).toLocaleString()}`}
                            </p>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                            <StatusBadge status={d.status} />
                            <span style={{
                              fontSize: "var(--text-xs)",
                              fontWeight: 700,
                              padding: "3px 10px",
                              borderRadius: "999px",
                              background: isPending ? "var(--danger-bg)" : isResolvedRelease ? "var(--success-bg)" : "var(--info-bg)",
                              color: isPending ? "var(--danger)" : isResolvedRelease ? "var(--success)" : "var(--info)",
                              border: `1px solid ${isPending ? "var(--danger)" : isResolvedRelease ? "var(--success)" : "var(--info)"}`,
                            }}>
                              {isPending
                                ? `🔒 ৳${d.estimated_price} Held in Escrow`
                                : isResolvedRelease
                                ? `✓ ৳${d.estimated_price} Released to Provider`
                                : `↺ ৳${d.estimated_price} Refunded to Customer`}
                            </span>
                          </div>
                        </div>

                        {/* Two-column Party Information */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                          gap: "var(--sp-4)",
                          marginBottom: "var(--sp-4)",
                        }}>
                          {/* Customer */}
                          <div style={{
                            padding: "var(--sp-3) var(--sp-4)",
                            background: "var(--surface)",
                            borderRadius: "var(--r-md)",
                            border: "1px solid var(--border)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <Icon name="user" size={14} color="var(--a-500)" />
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                                Customer
                              </span>
                            </div>
                            <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{d.customer_name}</p>
                            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                              Phone: <a href={`tel:${d.customer_phone}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{d.customer_phone}</a>
                            </p>
                            {d.location?.address && (
                              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                                Location: {d.location.address}
                              </p>
                            )}
                          </div>

                          {/* Provider */}
                          <div style={{
                            padding: "var(--sp-3) var(--sp-4)",
                            background: "var(--surface)",
                            borderRadius: "var(--r-md)",
                            border: "1px solid var(--border)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <Icon name="wrench" size={14} color="var(--a-500)" />
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                                Assigned Provider
                              </span>
                            </div>
                            <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{d.provider?.name || "Provider"}</p>
                            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                              Base Charge: <strong>৳{d.base_price || d.estimated_price}</strong> · Rate: <strong>৳{d.estimated_price}</strong>
                            </p>
                            {d.provider?.phone && (
                              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                                Phone: <a href={`tel:${d.provider.phone}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{d.provider.phone}</a>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Customer Dispute Statement & Proof */}
                        <div style={{
                          background: isPending ? "var(--danger-bg)" : "var(--surface)",
                          border: `1.5px solid ${isPending ? "hsl(0, 80%, 75%)" : "var(--border)"}`,
                          padding: "var(--sp-4)",
                          borderRadius: "var(--r-md)",
                          marginBottom: "var(--sp-4)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <Icon name="alert-circle" size={16} color={isPending ? "var(--danger)" : "var(--text-body)"} />
                            <span style={{
                              fontWeight: 800,
                              fontSize: "var(--text-sm)",
                              color: isPending ? "var(--danger)" : "var(--text-body)",
                              textTransform: "uppercase",
                              letterSpacing: ".03em",
                            }}>
                              Customer Dispute Statement
                            </span>
                          </div>

                          <p style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--text-body)",
                            lineHeight: 1.5,
                            background: "var(--surface-raised)",
                            padding: "var(--sp-3)",
                            borderRadius: "var(--r-sm)",
                            border: "1px solid var(--border)",
                          }}>
                            "{d.dispute_note || "No explanation provided"}"
                          </p>

                          {d.dispute_image_url ? (
                            <div style={{ marginTop: "var(--sp-3)" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                                Customer's Attached Photo Evidence:
                              </span>
                              <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                                <img
                                  src={d.dispute_image_url}
                                  alt="Customer dispute proof"
                                  onClick={() => setPreviewImage(d.dispute_image_url)}
                                  style={{
                                    width: 160,
                                    height: 110,
                                    objectFit: "cover",
                                    borderRadius: "var(--r-md)",
                                    border: "1.5px solid var(--border)",
                                    cursor: "pointer",
                                    boxShadow: "var(--shadow-sm)",
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(d.dispute_image_url)}
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: "2px 0", height: "auto", fontSize: 11, color: "var(--accent)", fontWeight: 700, justifyContent: "flex-start", gap: 4 }}
                                >
                                  <Icon name="search" size={12} /> Click to expand photo
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--sp-2)", fontStyle: "italic" }}>
                              No photo proof was attached with this report.
                            </p>
                          )}
                        </div>

                        {/* Original Job Context */}
                        {(d.problem_details || d.image_url) && (
                          <details style={{
                            marginBottom: "var(--sp-4)",
                            padding: "var(--sp-3) var(--sp-4)",
                            background: "var(--surface)",
                            borderRadius: "var(--r-md)",
                            border: "1px solid var(--border)",
                          }}>
                            <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                              View Initial Booking Description & Issue Photo
                            </summary>
                            <div style={{ marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                              {d.problem_details && (
                                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-body)", marginBottom: "var(--sp-2)" }}>
                                  <strong>Initial Description:</strong> {d.problem_details}
                                </p>
                              )}
                              {d.image_url && (
                                <div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>Initial Problem Photo:</span>
                                  <div style={{ marginTop: 4 }}>
                                    <img
                                      src={d.image_url}
                                      alt="Initial booking"
                                      onClick={() => setPreviewImage(d.image_url)}
                                      style={{ width: 120, height: 80, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", cursor: "pointer" }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {/* Decision Bar / Resolution Summary */}
                        {isPending ? (
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "var(--sp-3)",
                            background: "var(--surface)",
                            padding: "var(--sp-4)",
                            borderRadius: "var(--r-md)",
                            border: "1px solid var(--border)",
                          }}>
                            <div>
                              <p style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
                                Arbitration Ruling Required
                              </p>
                              <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                                Escrow payout of ৳{d.estimated_price} is currently held.
                              </p>
                            </div>

                            <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  setResolvingDispute(d);
                                  setResolveAction("refund");
                                  setAdminNote("");
                                }}
                                style={{
                                  color: "var(--info)",
                                  borderColor: "var(--info)",
                                  fontWeight: 700,
                                  gap: 6,
                                }}
                              >
                                <Icon name="refresh-cw" size={15} />
                                <span>Refund Customer (৳{d.estimated_price})</span>
                              </button>

                              <button
                                className="btn btn-primary"
                                onClick={() => {
                                  setResolvingDispute(d);
                                  setResolveAction("release");
                                  setAdminNote("");
                                }}
                                style={{
                                  background: "var(--success)",
                                  borderColor: "var(--success)",
                                  fontWeight: 700,
                                  gap: 6,
                                }}
                              >
                                <Icon name="check-circle" size={15} />
                                <span>Release to Provider (৳{d.estimated_price})</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            padding: "var(--sp-3) var(--sp-4)",
                            borderRadius: "var(--r-md)",
                            background: isResolvedRelease ? "var(--success-bg)" : "var(--info-bg)",
                            border: `1px solid ${isResolvedRelease ? "var(--success)" : "var(--info)"}`,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "var(--sp-2)",
                          }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Icon
                                  name={isResolvedRelease ? "check-circle" : "refresh-cw"}
                                  size={16}
                                  color={isResolvedRelease ? "var(--success)" : "var(--info)"}
                                />
                                <span style={{
                                  fontWeight: 800,
                                  fontSize: "var(--text-sm)",
                                  color: isResolvedRelease ? "var(--success)" : "var(--info)",
                                }}>
                                  {isResolvedRelease ? "Case Settled: Payment Released to Provider" : "Case Settled: Full Refund Issued to Customer"}
                                </span>
                              </div>
                              {d.dispute_admin_note && (
                                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-body)", marginTop: 3 }}>
                                  <strong>Admin Remarks:</strong> "{d.dispute_admin_note}"
                                </p>
                              )}
                            </div>
                            {d.dispute_resolved_at && (
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                                Resolved on {new Date(d.dispute_resolved_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── TAB 3: PROVIDER APPROVALS ── */}
      {tab === "providers" && (
        <div>
          <div style={{ marginBottom: "var(--sp-6)" }}>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Pending Provider Applications</h2>
            <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              When a new service provider signs up, they remain pending until approved by an admin.
            </p>
          </div>

          {loadingProviders ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="card" style={{ height: 120, padding: "var(--sp-4)" }}>
                  <Skeleton height={24} width="50%" style={{ marginBottom: "var(--sp-2)" }} />
                  <Skeleton height={16} width="80%" />
                </div>
              ))}
            </div>
          ) : pendingProviders.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "var(--sp-12)" }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "var(--success-subtle, #dcfce7)",
                display: "grid", placeItems: "center", margin: "0 auto var(--sp-4)",
              }}>
                <Icon name="check-circle" size={32} color="var(--success)" />
              </div>
              <h3 style={{ fontWeight: 700, marginBottom: "var(--sp-2)" }}>No Pending Applications</h3>
              <p className="text-muted" style={{ fontSize: "var(--text-sm)", maxWidth: 420, margin: "0 auto" }}>
                All provider accounts have been reviewed. When new providers register, they will appear here for approval.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {pendingProviders.map(p => (
                <div
                  key={p.provider_id}
                  className="card"
                  style={{
                    padding: "var(--sp-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--sp-4)",
                    borderLeft: "4px solid var(--warning)",
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "var(--sp-3)",
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{p.business_name}</h3>
                        <span style={{
                          background: "var(--surface-raised)",
                          padding: "2px 8px",
                          borderRadius: "var(--r-full)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                        }}>
                          {p.service_type}
                        </span>
                        <span style={{
                          background: "var(--warning)",
                          color: "#000",
                          padding: "2px 8px",
                          borderRadius: "var(--r-full)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                        }}>
                          Pending Approval
                        </span>
                      </div>

                      <div style={{
                        display: "flex",
                        gap: "var(--sp-4)",
                        flexWrap: "wrap",
                        marginTop: "var(--sp-2)",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                      }}>
                        <span>Email: <strong>{p.email}</strong></span>
                        <span>Phone: <strong>{p.phone}</strong></span>
                        <span>Base Price: <strong>৳{p.price}</strong></span>
                        {p.location?.address && <span>Area: <strong>{p.location.address}</strong></span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={actionLoadingId === p.provider_id}
                        onClick={() => handleReject(p.provider_id, p.business_name)}
                        style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                      >
                        <Icon name="x-circle" size={14} /> Reject
                      </button>

                      <button
                        className="btn btn-primary btn-sm"
                        disabled={actionLoadingId === p.provider_id}
                        onClick={() => handleApprove(p.provider_id, p.business_name)}
                        style={{ background: "var(--success)", borderColor: "var(--success)" }}
                      >
                        <Icon name="check-circle" size={14} /> Approve Provider
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: USER DIRECTORY & BANS ── */}
      {tab === "users" && (
        <div>
          <div style={{ marginBottom: "var(--sp-6)" }}>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>User Directory & Access Control</h2>
            <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              Manage registered customers, providers, and accounts. Banned users cannot log in or make bookings.
            </p>
          </div>

          {/* Search and filter bar */}
          <div style={{
            display: "flex",
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-6)",
            flexWrap: "wrap",
          }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="input"
              style={{ flex: 1, minWidth: 220 }}
            />
            <select
              value={userRoleFilter}
              onChange={e => setUserRoleFilter(e.target.value)}
              className="input"
              style={{ width: "auto", minWidth: 150 }}
            >
              <option value="">All Roles</option>
              <option value="customer">Customers</option>
              <option value="provider">Providers</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          {loadingUsers ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="card" style={{ height: 60, padding: "var(--sp-3)" }}>
                  <Skeleton height={20} width="60%" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "var(--sp-10)" }}>
              <Icon name="users" size={36} color="var(--text-muted)" />
              <p style={{ marginTop: "var(--sp-2)", fontWeight: 600 }}>No users found</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {users.map(u => {
                const isAdmin = u.role === "admin";
                const isBanned = u.is_banned;

                return (
                  <div
                    key={u.id}
                    className="card"
                    style={{
                      padding: "var(--sp-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-4)",
                      flexWrap: "wrap",
                      background: isBanned ? "var(--surface-raised)" : "var(--surface)",
                      borderColor: isBanned ? "var(--danger)" : "var(--border)",
                      opacity: isBanned ? 0.85 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 260 }}>
                      <div style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: isAdmin
                          ? "var(--accent-subtle)"
                          : u.role === "provider"
                          ? "var(--info-subtle, #e0f2fe)"
                          : "var(--surface-raised)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        color: isAdmin ? "var(--accent)" : "var(--text-primary)",
                      }}>
                        {u.name?.charAt(0)?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                          <span style={{
                            fontSize: "var(--text-xs)",
                            padding: "1px 6px",
                            borderRadius: "var(--r-full)",
                            fontWeight: 600,
                            textTransform: "capitalize",
                            background: isAdmin ? "var(--accent-subtle)" : "var(--surface-raised)",
                            color: isAdmin ? "var(--accent)" : "var(--text-secondary)",
                          }}>
                            {u.role}
                          </span>
                          {isBanned && (
                            <span style={{
                              fontSize: "var(--text-xs)",
                              padding: "1px 6px",
                              borderRadius: "var(--r-full)",
                              fontWeight: 700,
                              background: "var(--danger)",
                              color: "#fff",
                            }}>
                              Banned
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                          {u.email} • {u.phone}
                          {u.provider_service_type && ` • ${u.provider_service_type}`}
                        </p>
                      </div>
                    </div>

                    {/* Ban / Unban actions */}
                    <div>
                      {isAdmin ? (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontStyle: "italic" }}>
                          Admin account
                        </span>
                      ) : (
                        <button
                          className={`btn btn-sm ${isBanned ? "btn-secondary" : "btn-secondary"}`}
                          disabled={actionLoadingId === u.id}
                          onClick={() => handleToggleBan(u)}
                          style={{
                            borderColor: isBanned ? "var(--success)" : "var(--danger)",
                            color: isBanned ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          <Icon name={isBanned ? "check-circle" : "slash"} size={14} />
                          {isBanned ? "Unban Account" : "Ban User"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dispute Arbitration Ruling Modal */}
      {resolvingDispute && (
        <Modal
          open={Boolean(resolvingDispute)}
          onClose={() => setResolvingDispute(null)}
          title={
            resolveAction === "release"
              ? `Release Payment for Booking #${resolvingDispute.id.slice(-6)}`
              : `Refund Customer for Booking #${resolvingDispute.id.slice(-6)}`
          }
          footer={
            <>
              <button
                className="btn btn-secondary"
                disabled={actionLoadingId === resolvingDispute.id}
                onClick={() => setResolvingDispute(null)}
              >
                Cancel
              </button>
              <button
                className={`btn ${resolveAction === "release" ? "btn-primary" : "btn-danger"}`}
                disabled={actionLoadingId === resolvingDispute.id}
                onClick={handleResolveDispute}
                style={
                  resolveAction === "release"
                    ? { background: "var(--success)", borderColor: "var(--success)" }
                    : {}
                }
              >
                {actionLoadingId === resolvingDispute.id ? (
                  <span className="btn-loading" />
                ) : resolveAction === "release" ? (
                  "Confirm Release to Provider"
                ) : (
                  "Confirm Full Refund to Customer"
                )}
              </button>
            </>
          }
        >
          <div>
            <div
              style={{
                padding: "var(--sp-4)",
                background:
                  resolveAction === "release"
                    ? "var(--success-bg)"
                    : "var(--danger-bg)",
                borderRadius: "var(--r-md)",
                border: `1.5px solid ${
                  resolveAction === "release" ? "var(--success)" : "var(--danger)"
                }`,
                marginBottom: "var(--sp-4)",
              }}
            >
              <p
                style={{
                  fontWeight: 800,
                  fontSize: "var(--text-sm)",
                  color:
                    resolveAction === "release"
                      ? "var(--success)"
                      : "var(--danger)",
                  marginBottom: 4,
                }}
              >
                {resolveAction === "release"
                  ? "Ruling: Service Satisfactory — Pay Provider"
                  : "Ruling: Service Unsatisfactory — Refund Customer"}
              </p>
              <p style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                {resolveAction === "release"
                  ? `Funds of ৳${resolvingDispute.estimated_price} will be released from escrow to ${
                      resolvingDispute.provider?.name || "the provider"
                    }. Booking will be marked Completed and official invoice issued.`
                  : `Funds of ৳${resolvingDispute.estimated_price} will be refunded to ${
                      resolvingDispute.customer_name
                    }. Provider payout will be cancelled and booked slot released.`}
              </p>
            </div>

            <div style={{ marginBottom: "var(--sp-4)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 6,
                }}
              >
                Admin Decision Remarks / Explanation (Optional)
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Explain the findings from the inspection or evidence review (sent to both parties)..."
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                style={{ width: "100%", resize: "vertical", height: "auto" }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Photo Preview Modal */}
      {previewImage && (
        <Modal
          open={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          title="Evidence Photo Inspection"
        >
          <div style={{ textAlign: "center" }}>
            <img
              src={previewImage}
              alt="Dispute inspection proof"
              style={{
                maxWidth: "100%",
                maxHeight: "72vh",
                objectFit: "contain",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
