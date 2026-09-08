import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Icon from "./Icon";
import { useState, useEffect } from "react";

export default function Nav() {
  const { user, unread, signOut } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function handleSignOut() {
    signOut();
    success("Signed out successfully");
    navigate("/");
  }

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "U";

  return (
    <nav className="nav" role="navigation" aria-label="Main navigation">
      <div className="container nav-inner">
        {/* Brand */}
        <Link to="/" className="nav-brand">
          <div className="nav-brand-icon">
            <Icon name="home" size={20} color="#fff" />
          </div>
          <div className="nav-brand-text">
            <span className="nav-brand-title">Home<span>Serve</span></span>
            <span className="nav-brand-sub">Smart Automation</span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <div className="nav-links" style={{ display: "none" }}>
          {/* Handled for desktop via media query or inline flex */}
        </div>

        {/* Center / Navigation Links */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <NavLink
            to="/services"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon name="wrench" size={15} />
            <span>Services</span>
          </NavLink>

          {user?.role === "customer" && (
            <>
              <NavLink
                to="/book"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name="plus" size={15} />
                <span>Book Now</span>
              </NavLink>
              <NavLink
                to="/my-requests"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name="list" size={15} />
                <span>My Bookings</span>
              </NavLink>
            </>
          )}

          {user?.role === "provider" && (
            <>
              <NavLink
                to="/provider"
                end
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name="bar-chart" size={15} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/provider/jobs"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name="briefcase" size={15} />
                <span>Jobs Queue</span>
              </NavLink>
              <NavLink
                to="/provider/availability"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon name="calendar" size={15} />
                <span>Slots</span>
              </NavLink>
            </>
          )}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <Icon name="shield" size={15} />
              <span>Admin Console</span>
            </NavLink>
          )}
        </div>

        {/* Right Actions */}
        <div className="nav-actions">
          {/* Dark mode switch */}
          <button
            className="btn btn-ghost"
            style={{ width: 38, height: 38, padding: 0, borderRadius: "50%" }}
            onClick={() => setDark(d => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <Icon name={dark ? "sun" : "moon"} size={17} />
          </button>

          {user ? (
            <>
              {/* Notifications */}
              <Link
                to="/notifications"
                className="btn btn-ghost notif-bell"
                style={{ width: 38, height: 38, padding: 0, borderRadius: "50%" }}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                title="Notifications"
              >
                <Icon name="bell" size={17} />
                {unread > 0 && (
                  <span className="notif-badge" aria-hidden="true">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>

              {/* User Pill */}
              <Link
                to={user.role === "admin" ? "/admin" : user.role === "provider" ? "/provider/profile" : "/my-requests"}
                className="user-pill"
                title={`${user.name} (${user.role})`}
              >
                <div className="user-avatar">{initial}</div>
                <span style={{ fontSize: "var(--text-sm)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                  {user.name}
                </span>
                <span className={`user-role-tag ${user.role === "admin" ? "admin-tag" : ""}`}>
                  {user.role === "admin" ? "ADM" : user.role === "provider" ? "PRO" : "USER"}
                </span>
              </Link>

              {/* Sign out */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleSignOut}
                title="Sign out"
                style={{ gap: 4 }}
              >
                <Icon name="log-out" size={15} />
                <span style={{ display: "none", smDisplay: "inline" }}>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link to="/book" className="btn btn-primary btn-sm">
                Book a Service
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
