import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { signupProvider, getCategories } from "../api";

const TAGS = ["Fast", "Affordable", "Certified", "Experienced", "24/7", "Eco-friendly", "Licensed", "Insured"];

export default function SignupProvider() {
  const { signIn } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "",
    business_name: "", service_type: "", price: "", bio: "",
    address: "", expertise_tags: [],
  });
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState({});

  useEffect(() => { getCategories().then(setCategories).catch(() => {}); }, []);

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: "" }));
  }

  function toggleTag(tag) {
    setForm(f => ({
      ...f,
      expertise_tags: f.expertise_tags.includes(tag)
        ? f.expertise_tags.filter(t => t !== tag)
        : [...f.expertise_tags, tag],
    }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (form.password.length < 6) e.password = "Password must be at least 6 characters";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (!form.business_name.trim()) e.business_name = "Business name is required";
    if (!form.service_type) e.service_type = "Select a service category";
    if (!form.price || isNaN(form.price) || +form.price <= 0) e.price = "Enter a valid hourly rate";
    if (!form.address.trim()) e.address = "Address is required";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { token, user: u } = await signupProvider({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        business_name: form.business_name,
        service_type: form.service_type,
        price: +form.price,
        bio: form.bio,
        expertise_tags: form.expertise_tags,
        location: { address: form.address, lat: 23.8103, lng: 90.3654 },
      });
      signIn(token, u);
      success("Provider account created! Set up your availability to start receiving jobs.");
      navigate("/provider/availability");
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
        value={form[id]} onChange={e => set(id, e.target.value)} autoComplete={autocomplete} />
      {errs[id] && <p className="form-error" role="alert">{errs[id]}</p>}
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <h1 className="auth-title">Join as a provider</h1>
        <p className="auth-sub">Grow your business with HomeServe</p>
        <form onSubmit={handleSubmit} noValidate>
          <h3 style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontWeight: 600, marginBottom: "var(--sp-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Account</h3>
          {field("name", "Full name", "text", "name")}
          {field("email", "Email", "email", "email")}
          {field("password", "Password", "password", "new-password")}
          {field("phone", "Phone number", "tel", "tel")}

          <h3 style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontWeight: 600, margin: "var(--sp-6) 0 var(--sp-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Business</h3>
          {field("business_name", "Business / trading name")}

          <div className="form-group">
            <label htmlFor="service_type" className="form-label">Service category</label>
            <select id="service_type" className={`form-input${errs.service_type ? " is-invalid" : ""}`}
              value={form.service_type} onChange={e => set("service_type", e.target.value)}>
              <option value="">Select a category</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {errs.service_type && <p className="form-error" role="alert">{errs.service_type}</p>}
          </div>

          {field("price", "Hourly rate (BDT)", "number")}

          <div className="form-group">
            <label htmlFor="address" className="form-label">Business address</label>
            <input id="address" type="text" className={`form-input${errs.address ? " is-invalid" : ""}`}
              value={form.address} onChange={e => set("address", e.target.value)} autoComplete="street-address" />
            {errs.address && <p className="form-error" role="alert">{errs.address}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="bio" className="form-label">Bio <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
            <textarea id="bio" className="form-input" rows={3}
              value={form.bio} onChange={e => set("bio", e.target.value)}
              placeholder="Describe your experience and specialties…" />
          </div>

          <div className="form-group">
            <p className="form-label">Tags <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
              {TAGS.map(tag => (
                <button key={tag} type="button"
                  className={`btn btn-sm ${form.expertise_tags.includes(tag) ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => toggleTag(tag)} aria-pressed={form.expertise_tags.includes(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: "var(--sp-2)" }}>
            {loading ? <span className="btn-loading" /> : "Create provider account"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "var(--sp-6)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          Already have an account? <Link to="/login" className="link">Sign in</Link>
          {" · "}
          <Link to="/signup" className="link">Sign up as customer</Link>
        </p>
      </div>
    </div>
  );
}
