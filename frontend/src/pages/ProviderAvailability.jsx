import { useState, useEffect, useCallback } from "react";
import { mySlots, publishSlot, unpublishSlot } from "../api";
import { useToast } from "../context/ToastContext";
import Skeleton from "../components/Skeleton";
import Icon from "../components/Icon";

export default function ProviderAvailability() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "date|time_slot" string
  const [daysData, setDaysData] = useState([]);
  const [published, setPublished] = useState(new Set());
  const [bookedMap, setBookedMap] = useState(new Map());

  const fetchSlots = useCallback(async () => {
    try {
      const res = await mySlots(14);
      const days = res.days ?? [];
      setDaysData(days);

      const pubSet = new Set();
      const bMap = new Map();
      for (const day of days) {
        for (const s of day.slots ?? []) {
          const key = `${day.date}|${s.time_slot}`;
          if (s.published) pubSet.add(key);
          if (s.booked) bMap.set(key, s.booking_info || true);
        }
      }
      setPublished(pubSet);
      setBookedMap(bMap);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  function isPublished(date, slot) {
    return published.has(`${date}|${slot}`);
  }

  function getBooking(date, slot) {
    return bookedMap.get(`${date}|${slot}`);
  }

  async function toggleSlot(date, slot) {
    const key = `${date}|${slot}`;
    if (bookedMap.has(key)) {
      error("This slot is already booked for a client job and cannot be removed.");
      return;
    }

    setBusy(key);
    try {
      if (isPublished(date, slot)) {
        await unpublishSlot(date, slot);
        setPublished(prev => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
        success("Slot removed from booking calendar");
      } else {
        await publishSlot(date, slot);
        setPublished(prev => new Set([...prev, key]));
        success("Slot published & open for customer bookings");
      }
    } catch (e) {
      error(e.detail ?? "Failed to update slot.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--sp-4)", marginBottom: "var(--sp-6)" }}>
        <div>
          <h1 style={{ marginBottom: "var(--sp-1)" }}>Availability Schedule</h1>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
            Toggle time slots to open or close your calendar for customer bookings over the next 14 days.
          </p>
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-4)",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "8px 14px",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--a-500)" }} />
            <span>Available</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "hsl(280, 85%, 60%)" }} />
            <span style={{ color: "hsl(280, 85%, 55%)" }}>Booked Job</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--border)" }} />
            <span style={{ color: "var(--text-muted)" }}>Off / Closed</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card" style={{ padding: "var(--sp-5)" }}>
              <Skeleton height={18} width={140} style={{ marginBottom: "var(--sp-4)" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
                {Array.from({ length: 6 }, (_, j) => <Skeleton key={j} height={42} width={120} borderRadius="var(--r-md)" />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
          {daysData.map(day => {
            const d = new Date(day.date + "T00:00:00");
            const isToday = new Date().toISOString().slice(0, 10) === day.date;
            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            const bookedCount = (day.slots ?? []).filter(s => bookedMap.has(`${day.date}|${s.time_slot}`)).length;

            return (
              <div
                key={day.date}
                className="card"
                style={{
                  padding: "var(--sp-5)",
                  border: isToday ? "1.5px solid var(--a-400)" : "1px solid var(--border)",
                  background: isToday ? "linear-gradient(to right, var(--a-50), var(--surface-raised))" : "var(--surface-raised)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>{label}</h2>
                    {isToday && (
                      <span style={{ fontSize: 10, background: "var(--a-500)", color: "#fff", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>
                        TODAY
                      </span>
                    )}
                  </div>
                  {bookedCount > 0 && (
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "hsl(280, 85%, 55%)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="check-circle" size={13} color="hsl(280, 85%, 55%)" />
                      {bookedCount} slot{bookedCount > 1 ? "s" : ""} booked
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: "var(--sp-3)" }}>
                  {(day.slots ?? []).map(s => {
                    const slot = s.time_slot;
                    const key = `${day.date}|${slot}`;
                    const booking = getBooking(day.date, slot);
                    const isBooked = Boolean(booking);
                    const isPub = isPublished(day.date, slot);
                    const isBusy = busy === key;

                    if (isBooked) {
                      const customerName = typeof booking === "object" ? booking.customer_name : null;
                      const status = typeof booking === "object" ? booking.status : null;
                      return (
                        <div
                          key={slot}
                          title={customerName ? `Booked by ${customerName} (${status || "Active"})` : "Booked slot"}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "var(--r-md)",
                            background: "linear-gradient(135deg, hsl(275 80% 95%), hsl(260 75% 92%))",
                            border: "1.5px solid hsl(275, 75%, 65%)",
                            color: "hsl(275, 80%, 30%)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            textAlign: "center",
                            gap: 2,
                            boxShadow: "0 2px 6px hsl(275 80% 50% / 0.15)",
                            position: "relative",
                            cursor: "not-allowed",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: 13 }}>
                            <Icon name="check-circle" size={13} color="hsl(275, 80%, 40%)" />
                            <span>{slot}</span>
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: ".04em",
                              background: "hsl(275, 80%, 45%)",
                              color: "#fff",
                              padding: "1px 6px",
                              borderRadius: "var(--r-full)",
                              marginTop: 2,
                            }}
                          >
                            🔒 Booked
                          </span>
                          {customerName && (
                            <span style={{ fontSize: 10, color: "hsl(275, 60%, 35%)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {customerName}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`btn btn-sm ${isPub ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => toggleSlot(day.date, slot)}
                        disabled={busy !== null}
                        aria-pressed={isPub}
                        style={{
                          height: 52,
                          flexDirection: "column",
                          gap: 2,
                          justifyContent: "center",
                          alignItems: "center",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {isBusy ? (
                          <span className="btn-loading" />
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {isPub && <Icon name="check" size={12} />}
                              <span>{slot}</span>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>
                              {isPub ? "Open for booking" : "Click to open"}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

