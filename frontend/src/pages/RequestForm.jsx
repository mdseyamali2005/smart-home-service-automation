import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getCategories, getAvailability, matchPreview, createRequest, getProvider } from "../api";
import { getCategoryMeta } from "../categoryData";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import StarRating from "../components/StarRating";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";

const URGENCY_OPTS = [
  { value: "Normal",    label: "Normal",    desc: "Scheduled regular service · standard rates", color: "var(--info)", icon: "clock" },
  { value: "Urgent",    label: "Urgent",    desc: "Same-day priority dispatch (+25% surcharge)",  color: "var(--warning)", icon: "zap" },
  { value: "Emergency", label: "Emergency", desc: "Immediate 30-min response (+50% surcharge)", color: "var(--danger)", icon: "alert-circle" },
];

const CANDIDATE_BADGE = {
  cheapest:   { label: "Best Price",  color: "var(--success)" },
  best_rated: { label: "Top Rated",   color: "var(--accent)" },
  fastest:    { label: "Fastest ETA", color: "var(--warning)" },
};

export default function RequestForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { customer, user } = useAuth();
  const { success, error } = useToast();

  const urlCategory = params.get("category");
  const urlProviderId = params.get("provider_id");

  const [step, setStep] = useState(urlCategory || urlProviderId ? 1 : 0);
  const [categories, setCategories] = useState([]);
  const [availDays, setAvailDays] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [directProvider, setDirectProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    service_type: urlCategory || "",
    urgency: "Normal",
    date: "",
    time_slot: "",
    problem_details: "",
    image_url: "",
    chosen_provider_id: urlProviderId || null,
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Pre-select category from ?category=<name> or ?provider_id=<id>
  useEffect(() => {
    getCategories().then(cats => {
      setCategories(cats);
      const pre = params.get("category");
      if (pre) {
        const match = cats.find(c => String(c.id) === pre || c.name === pre);
        if (match) {
          setForm(f => ({ ...f, service_type: match.name }));
        }
      }
    });

    const preProv = params.get("provider_id");
    if (preProv) {
      set("chosen_provider_id", preProv);
      getProvider(preProv)
        .then(p => {
          if (p) {
            setDirectProvider(p);
            setForm(f => ({
              ...f,
              chosen_provider_id: p.id,
              ...(p.service_type ? { service_type: p.service_type } : {}),
            }));
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSlots = useCallback(async (serviceType, providerId = null) => {
    if (!serviceType) return;
    setLoading(true);
    try {
      const data = await getAvailability(serviceType, 14, providerId);
      const days = data.days ?? [];
      setAvailDays(days);
      // Auto-select the first day with available slots if no date is set yet or current date has no available slots
      setForm(prev => {
        const currentDay = days.find(d => d.date === prev.date);
        const currentDayHasAvail = currentDay?.slots?.some(s => s.available);
        if (prev.date && currentDayHasAvail) {
          const slotValid = currentDay.slots.some(s => s.time_slot === prev.time_slot && s.available);
          return slotValid ? prev : { ...prev, time_slot: "" };
        }
        const firstAvailableDay = days.find(d => d.slots?.some(s => s.available));
        return firstAvailableDay ? { ...prev, date: firstAvailableDay.date, time_slot: "" } : prev;
      });
    } catch {
      setAvailDays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 1 && form.service_type) {
      loadSlots(form.service_type, form.chosen_provider_id);
    }
  }, [step, form.service_type, form.chosen_provider_id, loadSlots]);

  async function handleMatchPreview() {
    setLoading(true);
    try {
      const data = await matchPreview({
        service_type: form.service_type,
        location: customer?.default_location ?? { address: "Dhaka", lat: 23.8103, lng: 90.3654 },
        date: form.date,
        time_slot: form.time_slot,
        urgency: form.urgency,
      });
      setCandidates(data.candidates ?? []);
      setStep(3);
    } catch (e) {
      if (e.status === 409) {
        error("This slot was just booked by another customer. Please pick another time slot.");
        loadSlots(form.service_type);
      } else {
        error(e.detail ?? "Could not find matching providers. Please try another time slot.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const body = {
        service_type: form.service_type,
        location: customer?.default_location ?? { address: "Dhaka", lat: 23.8103, lng: 90.3654 },
        date: form.date,
        time_slot: form.time_slot,
        urgency: form.urgency,
        problem_details: form.problem_details,
        customer_name: customer?.name ?? user?.name ?? "Customer",
        customer_phone: customer?.phone ?? user?.phone ?? "01711000000",
        ...(form.image_url ? { image_url: form.image_url } : {}),
        ...(form.chosen_provider_id ? { chosen_provider_id: form.chosen_provider_id } : {}),
      };
      const req = await createRequest(body);
      success("Booking placed successfully! Tracking your service now.");
      navigate(`/track/${req.id}`);
    } catch (e) {
      if (e.status === 409) {
        error("Double booking prevented: This slot was just booked by someone else! Please select another slot.");
        setStep(1);
        loadSlots(form.service_type);
      } else {
        error(e.detail ?? "Booking failed. Please check details and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("image_url", ev.target.result);
    reader.readAsDataURL(file);
  }

  const STEP_LABELS = ["Category", "Date & Slot", "Details", directProvider ? "Confirmation" : "Smart Match"];

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 680 }}>
      {/* ── Modern Step Indicator ────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--sp-8)" }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-1)" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--surface-raised)",
                  color: i <= step ? "#fff" : "var(--text-muted)",
                  fontWeight: 700,
                  fontSize: "var(--text-sm)",
                  border: i === step ? "2px solid var(--accent)" : i < step ? "2px solid var(--success)" : "2px solid var(--border)",
                  boxShadow: i === step ? "0 0 0 4px hsl(242 80% 57% / 0.2)" : "none",
                  transition: "all 200ms var(--ease)",
                }}
              >
                {i < step ? <Icon name="check" size={16} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? "var(--accent)" : "var(--text-muted)", fontWeight: i === step ? 700 : 500, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? "var(--success)" : "var(--border)", margin: "0 var(--sp-2)", marginBottom: "var(--sp-5)", transition: "background 250ms var(--ease)" }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 0 — Category Selection ──────────────────────────────── */}
      {step === 0 && (
        <div style={{ animation: "fade-in 180ms var(--ease)" }}>
          <div style={{ marginBottom: "var(--sp-6)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Choose a Service Category</h1>
            <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
              Select the type of home maintenance or repair you need
            </p>
          </div>

          {categories.length === 0 ? (
            <div className="category-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="category-card">
                  <Skeleton height={50} width={50} borderRadius="var(--r-md)" style={{ margin: "0 auto var(--sp-3)" }} />
                  <Skeleton height={14} width="70%" style={{ margin: "0 auto" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="category-grid">
              {categories.map(cat => {
                const meta = getCategoryMeta(cat.name);
                const isActive = form.service_type === cat.name;
                return (
                  <button
                    key={cat.id}
                    className={`category-card${isActive ? " active" : ""}`}
                    onClick={() => {
                      set("service_type", cat.name);
                      setStep(1);
                    }}
                  >
                    <div
                      className="category-icon-wrap"
                      style={{
                        background: meta.accentSubtle,
                        color: meta.accent,
                      }}
                    >
                      <span>{meta.emoji}</span>
                    </div>
                    <span className="category-name">{cat.name}</span>
                    <span className="category-price-badge">From ৳{cat.starting_price ?? 450}/hr</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 1 — Date, Time Slot & Urgency ────────────────────────── */}
      {step === 1 && (
        <div style={{ animation: "fade-in 180ms var(--ease)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-6)" }}>
            <div>
              <span style={{ fontSize: 11, color: "var(--a-500)", fontWeight: 700, textTransform: "uppercase" }}>
                Step 2 · Scheduling
              </span>
              <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Select Urgency & Slot</h1>
            </div>
            <span className="badge badge-requested">{form.service_type}</span>
          </div>

          {directProvider && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--sp-3) var(--sp-4)",
                background: "var(--a-50)",
                border: "1px solid var(--a-200)",
                borderRadius: "var(--r-md)",
                marginBottom: "var(--sp-5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                <Icon name="check-circle" size={16} color="var(--a-600)" />
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--a-900)" }}>
                  Booking directly with {directProvider.name}
                </span>
              </div>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 800, color: "var(--a-600)" }}>
                ৳{directProvider.price}/hr
              </span>
            </div>
          )}

          {/* Urgency Selector */}
          <div className="card" style={{ marginBottom: "var(--sp-6)", border: "1px solid var(--border)" }}>
            <label className="form-label" style={{ fontWeight: 700, marginBottom: "var(--sp-3)" }}>
              Service Urgency
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-3)" }}>
              {URGENCY_OPTS.map(u => {
                const isSel = form.urgency === u.value;
                return (
                  <button
                    key={u.value}
                    type="button"
                    className={`btn ${isSel ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      set("urgency", u.value);
                      set("date", "");
                      set("time_slot", "");
                    }}
                    style={{
                      height: "auto",
                      padding: "var(--sp-3)",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      borderColor: isSel ? u.color : undefined,
                    }}
                  >
                    <Icon name={u.icon} size={18} color={isSel ? "#fff" : u.color} />
                    <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{u.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--sp-3)", textAlign: "center" }}>
              {URGENCY_OPTS.find(u => u.value === form.urgency)?.desc}
            </p>
          </div>

          {/* Calendar & Time Slots */}
          <div className="card" style={{ border: "1px solid var(--border)", marginBottom: "var(--sp-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
              <div>
                <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>
                  Select Date & Time Slot
                </h2>
                <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                  Pick a date from the calendar to view available slots. Double-booking is strictly prohibited.
                </p>
              </div>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", padding: "var(--sp-4) 0" }}>
                <Skeleton height={60} />
                <Skeleton height={120} />
              </div>
            ) : availDays.length === 0 ? (
              <div className="empty-state" style={{ padding: "var(--sp-8) 0" }}>
                <Icon name="calendar-off" size={36} color="var(--text-muted)" />
                <p style={{ fontWeight: 600 }}>No availability found</p>
                <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>No providers are available for this service right now.</p>
              </div>
            ) : (
              <div>
                {/* 1. Date Selector Carousel / Grid */}
                <div style={{ marginBottom: "var(--sp-5)" }}>
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: "var(--sp-2)", display: "flex", justifyContent: "space-between" }}>
                    <span>📅 Step 1: Pick Service Date</span>
                    {form.date && (
                      <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "var(--text-xs)" }}>
                        Selected: {new Date(form.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                    )}
                  </label>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
                    gap: "var(--sp-2)",
                    padding: "2px",
                  }}>
                    {availDays.slice(0, 10).map(day => {
                      const isSelected = form.date === day.date;
                      const d = new Date(day.date + "T00:00:00");
                      const freeSlots = day.slots.filter(s => s.available);
                      const hasFree = freeSlots.length > 0;

                      return (
                        <button
                          key={day.date}
                          type="button"
                          disabled={!hasFree}
                          onClick={() => {
                            set("date", day.date);
                            const slotValid = day.slots.some(s => s.time_slot === form.time_slot && s.available);
                            if (!slotValid) set("time_slot", "");
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            padding: "var(--sp-2) var(--sp-1)",
                            borderRadius: "var(--r-md)",
                            border: isSelected
                              ? "2px solid var(--accent)"
                              : "1px solid var(--border)",
                            background: isSelected
                              ? "var(--accent-subtle)"
                              : hasFree
                              ? "var(--surface)"
                              : "var(--surface-raised)",
                            opacity: hasFree ? 1 : 0.45,
                            cursor: hasFree ? "pointer" : "not-allowed",
                            transition: "all 150ms var(--ease)",
                          }}
                        >
                          <span style={{
                            fontSize: "10px",
                            color: isSelected ? "var(--accent)" : "var(--text-muted)",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}>
                            {d.toLocaleDateString("en-US", { weekday: "short" })}
                          </span>
                          <span style={{
                            fontSize: "var(--text-lg)",
                            fontWeight: 800,
                            color: isSelected ? "var(--accent)" : "var(--text-primary)",
                            lineHeight: 1.2,
                          }}>
                            {d.getDate()}
                          </span>
                          <span style={{
                            fontSize: "9px",
                            color: isSelected ? "var(--accent)" : hasFree ? "var(--success)" : "var(--text-muted)",
                            fontWeight: 600,
                            marginTop: 2,
                          }}>
                            {hasFree ? `${freeSlots.length} open` : "Full"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Time Slots for the Selected Date */}
                {(() => {
                  const currentDay = availDays.find(d => d.date === form.date);
                  const slots = currentDay?.slots ?? [];

                  return (
                    <div>
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: "var(--sp-2)", display: "flex", justifyContent: "space-between" }}>
                        <span>⏰ Step 2: Choose Time Window</span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          2-hour arrival window
                        </span>
                      </label>

                      {!form.date ? (
                        <p className="text-muted" style={{ fontSize: "var(--text-xs)", textAlign: "center", padding: "var(--sp-4)" }}>
                          Please select a date above to view available time slots.
                        </p>
                      ) : slots.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: "var(--text-xs)", textAlign: "center", padding: "var(--sp-4)" }}>
                          No slots available on this date. Please pick another date.
                        </p>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "var(--sp-2)" }}>
                          {slots.map(s => {
                            const isSelected = form.time_slot === s.time_slot;
                            const isAvail = Boolean(s.available);
                            const isBooked = s.status === "booked" || Boolean(s.booked);
                            const isClosed = !isAvail && !isBooked;

                            let badgeLabel = "Open";
                            let badgeBg = "var(--success-subtle, #dcfce7)";
                            let badgeColor = "var(--success)";
                            let iconColor = isSelected ? "#fff" : "var(--text-secondary)";
                            let tooltipTitle = "Available for booking";

                            if (isBooked) {
                              badgeLabel = "Booked";
                              badgeBg = "var(--danger-subtle, #fee2e2)";
                              badgeColor = "var(--danger)";
                              iconColor = "var(--danger)";
                              tooltipTitle = "This slot is already booked. Double booking is prevented.";
                            } else if (isClosed) {
                              badgeLabel = "Closed";
                              badgeBg = "rgba(148, 163, 184, 0.15)";
                              badgeColor = "var(--text-muted)";
                              iconColor = "var(--text-muted)";
                              tooltipTitle = "This time slot is closed / unavailable for booking.";
                            }

                            return (
                              <button
                                key={s.time_slot}
                                type="button"
                                disabled={!isAvail}
                                onClick={() => set("time_slot", s.time_slot)}
                                className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "var(--sp-3)",
                                  height: "auto",
                                  opacity: isAvail ? 1 : 0.45,
                                  cursor: isAvail ? "pointer" : "not-allowed",
                                  background: isSelected ? "var(--accent)" : isAvail ? "var(--surface)" : "var(--surface-raised)",
                                  borderColor: isSelected ? "var(--accent)" : isAvail ? "var(--border)" : "var(--border)",
                                }}
                                title={tooltipTitle}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <Icon
                                    name={isAvail ? "clock" : "lock"}
                                    size={13}
                                    color={isSelected ? "#fff" : iconColor}
                                  />
                                  <span style={{
                                    fontWeight: 600,
                                    fontSize: "var(--text-xs)",
                                    textDecoration: isAvail ? "none" : "line-through",
                                    color: isSelected ? "#fff" : isAvail ? "var(--text-primary)" : "var(--text-muted)",
                                  }}>
                                    {s.time_slot}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: "10px",
                                  padding: "1px 6px",
                                  borderRadius: "var(--r-full)",
                                  fontWeight: 700,
                                  background: isSelected
                                    ? "rgba(255,255,255,0.25)"
                                    : badgeBg,
                                  color: isSelected
                                    ? "#fff"
                                    : badgeColor,
                                }}>
                                  {badgeLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {slots.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sp-4)", marginTop: "var(--sp-3)", fontSize: "11px", color: "var(--text-muted)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} /> Open (Available)
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)" }} /> Booked (Blocked)
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)" }} /> Closed (Blocked)
                          </span>
                        </div>
                      )}

                      {/* Verified Conflict-Free Banner */}
                      {form.date && form.time_slot && (
                        <div style={{
                          marginTop: "var(--sp-4)",
                          padding: "var(--sp-3)",
                          background: "var(--success-subtle, #ecfdf5)",
                          border: "1px solid var(--success)",
                          borderRadius: "var(--r-md)",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          fontSize: "var(--text-xs)",
                          color: "var(--success)",
                          fontWeight: 600,
                        }}>
                          <Icon name="check-circle" size={15} color="var(--success)" />
                          <span>
                            Selected: {form.date} at {form.time_slot} · Guaranteed no double-booking!
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <button className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!form.date || !form.time_slot}
              onClick={() => setStep(2)}
            >
              Continue to Details
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 — Describe the Problem & Photo ─────────────────────── */}
      {step === 2 && (
        <div style={{ animation: "fade-in 180ms var(--ease)" }}>
          <div style={{ marginBottom: "var(--sp-6)" }}>
            <span style={{ fontSize: 11, color: "var(--a-500)", fontWeight: 700, textTransform: "uppercase" }}>
              Step 3 · Scope of Work
            </span>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Describe the Problem</h1>
            <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
              Provide clear details so our technician arrives prepared with proper tools
            </p>
          </div>

          <div className="card" style={{ border: "1px solid var(--border)", marginBottom: "var(--sp-6)" }}>
            <div className="form-group">
              <label htmlFor="problem_details" className="form-label" style={{ fontWeight: 700 }}>
                What needs fixing or servicing? <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea
                id="problem_details"
                className="form-input"
                rows={4}
                value={form.problem_details}
                onChange={e => set("problem_details", e.target.value)}
                placeholder="e.g. Master bedroom split AC is blowing warm air and making a vibrating noise when the compressor starts…"
              />
            </div>

            <div className="form-group" style={{ marginTop: "var(--sp-4)" }}>
              <label htmlFor="image" className="form-label" style={{ fontWeight: 700 }}>
                Attach Photo <span className="text-muted" style={{ fontWeight: 400 }}>(Optional, helps diagnosis)</span>
              </label>
              <input id="image" type="file" accept="image/*" onChange={handleImage} style={{ display: "none" }} />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => document.getElementById("image").click()}
                style={{ width: "100%", height: 80, flexDirection: "column", gap: "var(--sp-1)" }}
              >
                {form.image_url ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                    <img src={form.image_url} alt="Issue preview" style={{ height: 50, borderRadius: "var(--r-sm)" }} />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--success)", fontWeight: 600 }}>Photo attached · Click to change</span>
                  </div>
                ) : (
                  <>
                    <Icon name="image" size={22} color="var(--a-500)" />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Click or tap to upload photo</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!form.problem_details.trim() || loading}
              onClick={directProvider ? () => setStep(3) : handleMatchPreview}
            >
              {loading ? <span className="btn-loading" /> : (directProvider ? "Continue to Confirmation" : "Run Smart Provider Matching")}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Confirmation (Direct Provider or Smart Match) ─────── */}
      {step === 3 && (
        <div style={{ animation: "fade-in 180ms var(--ease)" }}>
          {directProvider ? (
            <div>
              <div style={{ marginBottom: "var(--sp-6)" }}>
                <span style={{ fontSize: 11, color: "var(--a-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Step 4 · Direct Provider Booking
                </span>
                <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Confirm Provider & Booking</h1>
                <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
                  You have directly selected {directProvider.name}. Please review details before confirming.
                </p>
              </div>

              {/* Provider Info Card */}
              <div
                className="card"
                style={{
                  border: "1.5px solid var(--a-500)",
                  background: "var(--surface-raised)",
                  marginBottom: "var(--sp-5)",
                  padding: "var(--sp-6)",
                  boxShadow: "0 8px 24px -4px hsl(242 80% 57% / 0.12)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-4)" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "var(--r-md)",
                      background: "linear-gradient(135deg, var(--a-500), hsl(265, 80%, 60%))",
                      color: "#fff",
                      fontSize: 20,
                      fontWeight: 800,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {directProvider.name ? directProvider.name.charAt(0).toUpperCase() : "P"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{directProvider.name}</h2>
                        <span style={{ fontSize: 10, background: "var(--a-100)", color: "var(--a-700)", padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>
                          DIRECT SELECTION
                        </span>
                      </div>
                      <span style={{ fontSize: "var(--text-base)", fontWeight: 800, color: "var(--a-600)" }}>
                        ৳{directProvider.price}/hr
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <StarRating value={directProvider.rating ?? 0} size={14} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                        {directProvider.rating ? directProvider.rating.toFixed(1) : "New"}
                      </span>
                      {directProvider.rating_count > 0 && (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          ({directProvider.rating_count} reviews)
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {directProvider.service_type}</span>
                    </div>

                    {directProvider.location?.address && (
                      <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 6 }}>
                        📍 Serving {directProvider.location.address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Booking Schedule Summary */}
                <div style={{ marginTop: "var(--sp-5)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                  <div style={{ background: "var(--surface)", padding: "var(--sp-3) var(--sp-4)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>SCHEDULED TIME</span>
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="calendar" size={14} color="var(--a-500)" />
                      {form.date} · {form.time_slot}
                    </p>
                  </div>
                  <div style={{ background: "var(--surface)", padding: "var(--sp-3) var(--sp-4)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>PRIORITY / URGENCY</span>
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="clock" size={14} color="var(--a-500)" />
                      {form.urgency}
                    </p>
                  </div>
                </div>

                {/* Problem Note & Image preview */}
                <div style={{ marginTop: "var(--sp-4)", background: "var(--surface)", padding: "var(--sp-4)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>PROBLEM DETAILS</span>
                  <p style={{ fontSize: "var(--text-sm)", marginTop: 4, color: "var(--text-body)" }}>
                    {form.problem_details}
                  </p>
                  {form.image_url && (
                    <div style={{ marginTop: "var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <img src={form.image_url} alt="Attached issue" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }} />
                      <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>Issue photo attached</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1, gap: 8 }}
                  disabled={submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? <span className="btn-loading" /> : (
                    <>
                      <Icon name="check-circle" size={18} />
                      <span>Confirm & Book with {directProvider.name}</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ textAlign: "center", marginTop: "var(--sp-4)" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-muted"
                  onClick={() => {
                    setDirectProvider(null);
                    set("chosen_provider_id", null);
                    handleMatchPreview();
                  }}
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Want system algorithm auto-dispatch instead? Switch to Smart Match
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "var(--sp-6)" }}>
                <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 700, textTransform: "uppercase" }}>
                  Step 4 · Algorithm Matched
                </span>
                <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Confirm Provider & Booking</h1>
                <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
                  Our weighted algorithm scored available pros for your location and time window.
                </p>
              </div>

              {candidates.length === 0 ? (
                <div className="empty-state">
                  <Icon name="user-x" size={40} color="var(--text-muted)" />
                  <p style={{ fontWeight: 700 }}>No providers found for this slot</p>
                  <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--sp-4)" }}>
                    Try choosing another time slot or adjusting urgency.
                  </p>
                  <button className="btn btn-secondary" onClick={() => setStep(1)}>
                    Change Time Slot
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: "var(--sp-6)" }}>
                  {/* Option 1: AI Auto-Assign */}
                  <div
                    className="card"
                    style={{
                      cursor: "pointer",
                      border: "1.5px solid",
                      borderColor: form.chosen_provider_id === null ? "var(--a-500)" : "var(--border)",
                      background: form.chosen_provider_id === null ? "var(--a-50)" : "var(--surface-raised)",
                      transition: "all 180ms var(--ease)",
                    }}
                    onClick={() => set("chosen_provider_id", null)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, var(--a-500), hsl(265, 80%, 60%))", color: "#fff", display: "grid", placeItems: "center" }}>
                          <Icon name="sparkles" size={18} color="#fff" />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <p style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>Smart Auto-Assign (Recommended)</p>
                            <span style={{ fontSize: 10, background: "var(--a-100)", color: "var(--a-700)", padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
                              OPTIMAL
                            </span>
                          </div>
                          <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                            System automatically dispatches the highest-scored technician
                          </p>
                        </div>
                      </div>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "2px solid",
                          borderColor: form.chosen_provider_id === null ? "var(--a-500)" : "var(--border)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {form.chosen_provider_id === null && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--a-500)" }} />}
                      </div>
                    </div>
                  </div>

                  {/* Matched Individual Candidates */}
                  {candidates.map(c => {
                    const prov = c.provider ?? {};
                    const provId = prov.id ?? c.provider_id;
                    const isSelected = form.chosen_provider_id === provId;
                    const initial = prov.name ? prov.name.charAt(0).toUpperCase() : "P";
                    const provPrice = c.estimated_price ?? prov.price ?? c.price;
                    const provRating = prov.rating ?? c.rating;
                    return (
                      <div
                        key={provId}
                        className="card"
                        style={{
                          cursor: "pointer",
                          border: "1.5px solid",
                          borderColor: isSelected ? "var(--a-500)" : "var(--border)",
                          background: isSelected ? "var(--a-50)" : "var(--surface-raised)",
                          transition: "all 180ms var(--ease)",
                        }}
                        onClick={() => set("chosen_provider_id", provId)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ display: "flex", gap: "var(--sp-3)", flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: "var(--r-md)",
                                background: "var(--surface-hover)",
                                border: "1px solid var(--border)",
                                fontWeight: 800,
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                              }}
                            >
                              {initial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: 2 }}>
                                <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{prov.name || "Provider"}</span>
                                {c.tags?.map(tag => (
                                  <span
                                    key={tag}
                                    style={{
                                      fontSize: 10,
                                      padding: "2px 7px",
                                      borderRadius: "var(--r-full)",
                                      background: CANDIDATE_BADGE[tag]?.color ?? "var(--accent-subtle)",
                                      color: "#fff",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {CANDIDATE_BADGE[tag]?.label ?? tag}
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <StarRating value={provRating ?? 0} size={12} />
                                <span style={{ fontSize: 11, fontWeight: 700 }}>{provRating ? provRating.toFixed(1) : "5.0"}</span>
                                <span className="text-muted" style={{ fontSize: 11 }}>· ৳{provPrice}/hr</span>
                              </div>
                              <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-2)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                                {c.eta_minutes && <span>⚡ ETA ~{c.eta_minutes} mins</span>}
                                {c.distance_km && <span>📍 {c.distance_km.toFixed(1)} km away</span>}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              border: "2px solid",
                              borderColor: isSelected ? "var(--a-500)" : "var(--border)",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                              marginLeft: "var(--sp-2)",
                            }}
                          >
                            {isSelected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--a-500)" }} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {candidates.length > 0 && (
                <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                  <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ flex: 1, gap: 8 }}
                    disabled={submitting}
                    onClick={handleConfirm}
                  >
                    {submitting ? <span className="btn-loading" /> : (
                      <>
                        <Icon name="check-circle" size={18} />
                        <span>Confirm & Book Service</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
