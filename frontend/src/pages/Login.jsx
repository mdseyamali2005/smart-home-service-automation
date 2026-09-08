import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { login } from "../api";

export default function Login() {
  const { signIn } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState({});

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: "" }));
  }

  function validate() {
    const e = {};
    if (!form.email) e.email = "Email is required";
    if (!form.password) e.password = "Password is required";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { token, user: u } = await login(form);
      signIn(token, u);
      success(`Welcome back, ${u.name}!`);
      const dest =
        from && from !== "/login"
          ? from
          : u.role === "admin"
          ? "/admin"
          : u.role === "provider"
          ? "/provider"
          : "/my-requests";
      navigate(dest, { replace: true });
    } catch (err) {
      error(err.detail ?? "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(email, password = "demo1234") {
    setForm({ email, password });
    setErrs({});
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Welcome back to HomeServe</p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input id="email" type="email" className={`form-input${errs.email ? " is-invalid" : ""}`}
              value={form.email} onChange={e => set("email", e.target.value)}
              autoComplete="email" autoFocus />
            {errs.email && <p className="form-error" role="alert">{errs.email}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input id="password" type="password" className={`form-input${errs.password ? " is-invalid" : ""}`}
              value={form.password} onChange={e => set("password", e.target.value)}
              autoComplete="current-password" />
            {errs.password && <p className="form-error" role="alert">{errs.password}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <span className="btn-loading" /> : "Sign in"}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div style={{
          marginTop: "var(--sp-6)",
          padding: "var(--sp-4)",
          background: "var(--surface-raised)",
          borderRadius: "var(--r-md)",
          border: "1px dashed var(--border)",
        }}>
          <p style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--sp-2)" }}>
            ⚡ One-Click Demo Logins (Pass: demo1234)
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fillDemo("admin@demo.com")}
              style={{ fontSize: "var(--text-xs)", padding: "4px 8px" }}
            >
              🛡️ Admin
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fillDemo("tanvir.ahmed@demo.com")}
              style={{ fontSize: "var(--text-xs)", padding: "4px 8px" }}
            >
              👤 Customer
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fillDemo("cooltech.ac.care@demo.com")}
              style={{ fontSize: "var(--text-xs)", padding: "4px 8px" }}
            >
              🔧 Provider
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: "var(--sp-6)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          No account? <Link to="/signup" className="link">Sign up as customer</Link>
          {" · "}
          <Link to="/signup/provider" className="link">Join as provider</Link>
        </p>
      </div>
    </div>
  );
}
