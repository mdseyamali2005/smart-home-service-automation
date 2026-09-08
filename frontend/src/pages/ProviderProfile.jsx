import { useState, useEffect } from "react";
import { updateProfile } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Skeleton from "../components/Skeleton";

const TAGS = ["fast", "affordable", "certified", "experienced", "24_7", "eco_friendly", "licensed", "insured"];
const TAG_LABELS = { fast: "Fast", affordable: "Affordable", certified: "Certified", experienced: "Experienced", "24_7": "24/7", eco_friendly: "Eco-friendly", licensed: "Licensed", insured: "Insured" };

export default function ProviderProfile() {
  const { provider, reload } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name ?? "",
        price: String(provider.price ?? ""),
        address: provider.location?.address ?? "",
        lat: String(provider.location?.lat ?? ""),
        lng: String(provider.location?.lng ?? ""),
        bio: provider.bio ?? "",
        expertise_tags: provider.expertise_tags ?? [],
      });
      setLoading(false);
    }
  }, [provider]);

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
    if (!form.name.trim()) e.name = "Business name is required";
    if (!form.price || isNaN(form.price) || +form.price < 100)
      e.price = "Enter a valid hourly rate (min 100 BDT)";
    if (!form.address.trim()) e.address = "Address is required";
    if (form.lat && isNaN(form.lat)) e.lat = "Must be a number";
    if (form.lng && isNaN(form.lng)) e.lng = "Must be a number";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const lat = form.lat ? +form.lat : (provider?.location?.lat ?? 23.8103);
      const lng = form.lng ? +form.lng : (provider?.location?.lng ?? 90.4125);
      await updateProfile({
        name: form.name.trim(),
        price: +form.price,
        location: { address: form.address.trim(), lat, lng },
        expertise_tags: form.expertise_tags,
        bio: form.bio.trim(),
      });
      await reload();
      success("Profile updated.");
    } catch (err) {
      error(err.detail ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 520 }}>
        <Skeleton height={28} width={180} style={{ marginBottom: "var(--sp-8)" }} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ marginBottom: "var(--sp-5)" }}>
            <Skeleton height={13} width={80} style={{ marginBottom: "var(--sp-2)" }} />
            <Skeleton height={40} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 520 }}>
      <h1 style={{ marginBottom: "var(--sp-2)" }}>Edit Profile</h1>
      <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--sp-8)" }}>
        Changes take effect immediately and influence how you appear in search results.
      </p>
      <form onSubmit={handleSubmit} noValidate>

        <div className="form-group">
          <label htmlFor="name" className="form-label">Business / trading name</label>
          <input id="name" type="text" className={`form-input${errs.name ? " is-invalid" : ""}`}
            value={form.name} onChange={e => set("name", e.target.value)} />
          {errs.name && <p className="form-error" role="alert">{errs.name}</p>}
        </div>

        <div className="form-group">
          <label htmlFor="price" className="form-label">Hourly rate (BDT)</label>
          <input id="price" type="number" min="100" className={`form-input${errs.price ? " is-invalid" : ""}`}
            value={form.price} onChange={e => set("price", e.target.value)} />
          {errs.price && <p className="form-error" role="alert">{errs.price}</p>}
        </div>

        <div className="form-group">
          <label htmlFor="address" className="form-label">Service area address</label>
          <input id="address" type="text" className={`form-input${errs.address ? " is-invalid" : ""}`}
            value={form.address} onChange={e => set("address", e.target.value)}
            placeholder="e.g. Mirpur 10, Dhaka" />
          {errs.address && <p className="form-error" role="alert">{errs.address}</p>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
          <div className="form-group">
            <label htmlFor="lat" className="form-label">Latitude <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
            <input id="lat" type="number" step="any" className={`form-input${errs.lat ? " is-invalid" : ""}`}
              value={form.lat} onChange={e => set("lat", e.target.value)} />
            {errs.lat && <p className="form-error" role="alert">{errs.lat}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="lng" className="form-label">Longitude <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
            <input id="lng" type="number" step="any" className={`form-input${errs.lng ? " is-invalid" : ""}`}
              value={form.lng} onChange={e => set("lng", e.target.value)} />
            {errs.lng && <p className="form-error" role="alert">{errs.lng}</p>}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="bio" className="form-label">Bio <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
          <textarea id="bio" className="form-input" rows={3}
            value={form.bio} onChange={e => set("bio", e.target.value)}
            placeholder="Describe your experience and specialties…" />
        </div>

        <div className="form-group">
          <p className="form-label">Expertise tags <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
            {TAGS.map(tag => (
              <button key={tag} type="button"
                className={`btn btn-sm ${form.expertise_tags.includes(tag) ? "btn-primary" : "btn-secondary"}`}
                onClick={() => toggleTag(tag)} aria-pressed={form.expertise_tags.includes(tag)}>
                {TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={saving}>
          {saving ? <span className="btn-loading" /> : "Save changes"}
        </button>
      </form>
    </div>
  );
}
