import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { signupCustomer } from "../api";

export default function SignupCustomer() {
  const { signIn } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState({});

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: "" }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (form.password.length < 6) e.password = "Password must be at least 6 characters";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (!form.address.trim()) e.address = "Address is required";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { token, user: u } = await signupCustomer({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        default_location: { address: form.address, lat: 23.8103, lng: 90.3654 },
      });
      signIn(token, u);
      success("Account created! Welcome to HomeServe.");
      navigate("/my-requests");
    } catch (err) {
      error(err.detail ?? "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = (id, label, type = "text", autocomplete) => (
    <div className="form-group">
      <label htmlFor={id} className="form-label">{label}</label>
      <input id={id} type={type} className={`form-input${errs[id] ? " is-invalid" : ""}`}
        value={form[id]} onChange={e => set(id, e.target.value)}
        autoComplete={autocomplete} />
      {errs[id] && <p className="form-error" role="alert">{errs[id]}</p>}
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Book home services in minutes</p>
        <form onSubmit={handleSubmit} noValidate>
          {field("name", "Full name", "text", "name")}
          {field("email", "Email", "email", "email")}
          {field("password", "Password", "password", "new-password")}
          {field("phone", "Phone number", "tel", "tel")}
          <div className="form-group">
            <label htmlFor="address" className="form-label">Home address</label>
            <textarea id="address" className={`form-input${errs.address ? " is-invalid" : ""}`}
              rows={2} value={form.address} onChange={e => set("address", e.target.value)} />
            {errs.address && <p className="form-error" role="alert">{errs.address}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <span className="btn-loading" /> : "Create account"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "var(--sp-6)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          Already have an account? <Link to="/login" className="link">Sign in</Link>
          {" · "}
          <Link to="/signup/provider" className="link">Join as provider</Link>
        </p>
      </div>
    </div>
  );
}
