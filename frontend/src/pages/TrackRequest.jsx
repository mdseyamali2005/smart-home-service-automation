import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getRequest, cancelRequest, rateService, getInvoice, releasePayment, disputeRequest } from "../api";
import { useToast } from "../context/ToastContext";
import StatusBadge from "../components/StatusBadge";
import StarRating from "../components/StarRating";
import Modal from "../components/Modal";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";

const TERMINAL = new Set(["Completed", "Cancelled", "Rejected", "Refunded"]);
const POLL_MS = 4000;

const STAGES = [
  { key: "Requested",  label: "Requested",   icon: "clipboard" },
  { key: "Accepted",   label: "Accepted",    icon: "check" },
  { key: "OnTheWay",   label: "On the Way",  icon: "truck" },
  { key: "InProgress", label: "In Progress", icon: "wrench" },
  { key: "WorkDone",   label: "Work Done",   icon: "clock" },
  { key: "Completed",  label: "Payment & Completed", icon: "check-circle" },
];

function getStageIndex(status) {
  switch (status) {
    case "Requested":
      return 0;
    case "Accepted":
      return 1;
    case "On the Way":
    case "OnTheWay":
      return 2;
    case "In Progress":
    case "InProgress":
    case "Arrived":
      return 3;
    case "Work Done":
    case "WorkDone":
      return 4;
    case "Completed":
      return 5;
    default:
      return -1;
  }
}

export default function TrackRequest() {
  const { id } = useParams();
  const { success, error } = useToast();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [disputeImage, setDisputeImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [rating, setRating] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [rating_loading, setRatingLoading] = useState(false);
  const pollRef = useRef(null);

  async function load() {
    try {
      const data = await getRequest(id);
      setReq(data);
      if (data.status === "Completed" && !invoice) {
        getInvoice(id).then(setInvoice).catch(() => {});
      }
    } catch {
      // retain state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!req) return;
    if (TERMINAL.has(req.status)) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [req?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelRequest(id);
      success("Service request cancelled.");
      setShowCancel(false);
      load();
    } catch (e) {
      error(e.detail ?? "Could not cancel request.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleReleasePayment() {
    setReleasing(true);
    try {
      await releasePayment(id);
      success("Payment released! Thank you for confirming.");
      setShowReleaseModal(false);
      await load();
      setShowRate(true);
    } catch (e) {
      error(e.detail || e.message || "Failed to release payment.");
    } finally {
      setReleasing(false);
    }
  }

  async function handleDispute() {
    const noteToSend = disputeNote.trim() || "Customer reported an issue with service completion.";
    setDisputing(true);
    try {
      await disputeRequest(id, { note: noteToSend, image_url: disputeImage });
      success("Dispute report submitted! Escrow is locked under Admin arbitration.");
      setShowDisputeModal(false);
      setDisputeNote("");
      setDisputeImage(null);
      await load();
    } catch (e) {
      error(e.detail || e.message || "Failed to submit dispute.");
    } finally {
      setDisputing(false);
    }
  }

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      error("Image file must be under 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDisputeImage(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleRate() {
    if (!rating) return;
    setRatingLoading(true);
    try {
      await rateService(id, rating);
      success("Thank you! Your review has been saved.");
      setShowRate(false);
      load();
    } catch (e) {
      error(e.detail ?? "Could not submit rating.");
    } finally {
      setRatingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 680 }}>
        <Skeleton height={32} width={260} style={{ marginBottom: "var(--sp-6)" }} />
        <Skeleton height={140} style={{ marginBottom: "var(--sp-4)" }} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
        <div className="empty-state">
          <Icon name="alert-circle" size={44} color="var(--danger)" />
          <p style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Request not found</p>
          <p className="text-muted" style={{ marginBottom: "var(--sp-4)" }}>The booking ID may be invalid or expired.</p>
          <Link to="/my-requests" className="btn btn-secondary">Back to My Bookings</Link>
        </div>
      </div>
    );
  }

  const stageIdx = getStageIndex(req.status);
  const isTerminalCancelled = req.status === "Cancelled" || req.status === "Rejected";
  const canCancel = !TERMINAL.has(req.status) && req.status !== "Work Done" && req.status !== "Disputed";
  const canRate = req.status === "Completed" && !req.rating;
  const progressPercent = stageIdx >= 0 ? (stageIdx / (STAGES.length - 1)) * 100 : 0;

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)", maxWidth: 680 }}>
      {/* Top Breadcrumb & Status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-6)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <Link to="/my-requests" className="btn btn-ghost" style={{ width: 36, height: 36, padding: 0, borderRadius: "50%" }}>
            <Icon name="arrow-left" size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>Booking #{id.slice(-6)}</h1>
            <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>Created on {req.created_at ? new Date(req.created_at).toLocaleDateString() : req.date}</p>
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* ── Visual Stage Progress Milestone Bar ────────────────────────── */}
      {!isTerminalCancelled && stageIdx >= 0 && (
        <div className="stage-tracker-wrapper">
          <div className="stage-tracker-header">
            <div>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--a-500)" }}>
                Live Job Automation
              </span>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>Real-Time Stage Milestones</h2>
            </div>
            {!TERMINAL.has(req.status) && (
              <span className="stage-live-badge">
                <span className="stage-live-dot" />
                <span>Live tracking</span>
              </span>
            )}
          </div>

          <div className="stage-steps">
            <div
              className="stage-progress-fill"
              style={{ width: `calc(${progressPercent}% * 0.88)` }}
            />
            {STAGES.map((s, i) => {
              const isCompleted = i < stageIdx;
              const isCurrent = i === stageIdx;
              const cls = isCompleted ? " completed" : isCurrent ? " current" : "";
              return (
                <div key={s.key} className={`stage-step-node${cls}`}>
                  <div className="stage-node-circle">
                    {isCompleted ? (
                      <Icon name="check" size={16} color="#fff" />
                    ) : isCurrent ? (
                      <Icon name={s.icon} size={15} color="#fff" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span className="stage-node-label">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Escrow Action: Provider Marked Work Completed ─────────────── */}
      {req.status === "Work Done" && (
        <div
          className="card"
          style={{
            marginBottom: "var(--sp-5)",
            border: "2px solid hsl(45, 95%, 50%)",
            background: "linear-gradient(135deg, hsl(45, 100%, 97%), var(--surface-raised))",
            padding: "var(--sp-5)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", marginBottom: "var(--sp-3)" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "hsl(45, 95%, 85%)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="clock" size={22} color="hsl(35, 95%, 35%)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <h2 style={{ fontSize: "var(--text-base)", fontWeight: 800, color: "hsl(35, 95%, 25%)" }}>
                  Work Marked Complete by Provider
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: "hsl(45, 95%, 82%)",
                    color: "hsl(35, 95%, 25%)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  🔒 ৳{req.estimated_price} HELD IN ESCROW
                </span>
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-body)", marginTop: 4, lineHeight: 1.5 }}>
                {req.provider?.name ?? "Your technician"} has declared the job complete. Please inspect the service performed.
                If satisfied, click <strong>Release Payment</strong> to transfer the funds to the provider. If the job was not done or there is damage, click <strong>Report Issue / Dispute</strong> to submit photos and details for Admin arbitration.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowReleaseModal(true)}
              style={{
                gap: 8,
                fontWeight: 700,
                background: "var(--success)",
                borderColor: "var(--success)",
                boxShadow: "0 2px 8px hsl(145, 75%, 40% / 0.25)",
              }}
            >
              <Icon name="check-circle" size={16} />
              <span>Release Payment (৳{req.estimated_price})</span>
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setShowDisputeModal(true)}
              style={{ gap: 8, fontWeight: 700 }}
            >
              <Icon name="alert-circle" size={16} />
              <span>Report Issue / Dispute</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Dispute Under Review Banner ────────────────────────────────── */}
      {req.status === "Disputed" && (
        <div
          className="card"
          style={{
            marginBottom: "var(--sp-5)",
            border: "2px solid var(--danger)",
            background: "linear-gradient(135deg, hsl(0, 100%, 98%), var(--surface-raised))",
            padding: "var(--sp-5)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", marginBottom: "var(--sp-3)" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--danger-bg)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="alert-circle" size={22} color="var(--danger)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <h2 style={{ fontSize: "var(--text-base)", fontWeight: 800, color: "var(--danger)" }}>
                  Dispute Under Review by Admin
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: "var(--danger-bg)",
                    color: "var(--danger)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  FUNDS PROTECTED IN ESCROW
                </span>
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                Your dispute report has been received and escalated to the platform admin team. The payment remains held securely. An administrator will inspect your report and attached photos to arbitrate a fair decision (payment release or refund).
              </p>

              {req.dispute_note && (
                <div
                  style={{
                    marginTop: "var(--sp-3)",
                    padding: "var(--sp-3) var(--sp-4)",
                    background: "var(--surface)",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".04em", marginBottom: 2 }}>
                    Your Report Details:
                  </p>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-body)" }}>{req.dispute_note}</p>
                </div>
              )}

              {req.dispute_image_url && (
                <div style={{ marginTop: "var(--sp-3)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: ".04em", marginBottom: 4 }}>
                    Attached Proof Photo:
                  </p>
                  <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                    <img
                      src={req.dispute_image_url}
                      alt="Dispute proof photo"
                      onClick={() => setPreviewImage(req.dispute_image_url)}
                      style={{
                        width: 140,
                        height: 96,
                        objectFit: "cover",
                        borderRadius: "var(--r-md)",
                        border: "1.5px solid var(--border)",
                        cursor: "pointer",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setPreviewImage(req.dispute_image_url)}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "2px 0", height: "auto", fontSize: 11, color: "var(--a-600)", fontWeight: 600, justifyContent: "flex-start", gap: 4 }}
                    >
                      <Icon name="search" size={12} /> Click to expand
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Refunded Banner ────────────────────────────────────────────── */}
      {req.status === "Refunded" && (
        <div
          className="card"
          style={{
            marginBottom: "var(--sp-5)",
            border: "2px solid var(--info)",
            background: "linear-gradient(135deg, hsl(210, 100%, 98%), var(--surface-raised))",
            padding: "var(--sp-5)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--info-bg)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="refresh-cw" size={22} color="var(--info)" />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <h2 style={{ fontSize: "var(--text-base)", fontWeight: 800, color: "var(--info)" }}>
                  Dispute Resolved — Refund Approved
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: "var(--info-bg)",
                    color: "var(--info)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  REFUND ISSUED
                </span>
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-body)", marginTop: 4 }}>
                The administrator ruled in your favor regarding this booking. <strong>৳{req.estimated_price}</strong> has been refunded to your original payment method.
              </p>
              {req.dispute_admin_note && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>
                  Admin Remarks: "{req.dispute_admin_note}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Provider Info Card (When Assigned) ─────────────────────────── */}
      {req.provider && (
        <div className="card" style={{ marginBottom: "var(--sp-4)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--sp-3)" }}>
            <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "var(--r-md)",
                  background: "linear-gradient(135deg, var(--a-500), hsl(265, 80%, 60%))",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 18,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {req.provider.name ? req.provider.name.charAt(0) : "P"}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>{req.provider.name}</h3>
                  <span style={{ fontSize: 10, background: "var(--success-bg)", color: "var(--success)", padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
                    VERIFIED
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <StarRating value={req.provider.rating ?? 5} size={13} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                    {req.provider.rating ? req.provider.rating.toFixed(1) : "5.0"}
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }}>· {req.service_type}</span>
                </div>
              </div>
            </div>

            {req.provider.phone && (
              <a
                href={`tel:${req.provider.phone}`}
                className="btn btn-secondary btn-sm"
                style={{ gap: 6 }}
              >
                <Icon name="phone" size={14} color="var(--a-500)" />
                <span>Call Provider</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Booking Details Card ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--sp-4)", border: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--sp-4)" }}>
          Booking Overview
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
          {[
            ["Service", req.service_type],
            ["Urgency Level", req.urgency],
            ["Date", req.date],
            ["Time Slot", req.time_slot],
            ["Assigned Pro", req.provider?.name ?? "Auto-matching in progress..."],
            ["Est. Base Rate", req.estimated_price ? `৳${req.estimated_price}` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 2 }}>
                {k}
              </p>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{v ?? "—"}</p>
            </div>
          ))}
        </div>

        {req.problem_details && (
          <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
              Issue Description
            </p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-body)" }}>{req.problem_details}</p>
          </div>
        )}

        {req.image_url && (
          <div style={{ marginTop: "var(--sp-4)" }}>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Attached Issue Photo
            </p>
            <img
              src={req.image_url}
              alt="Issue photo"
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}
            />
          </div>
        )}
      </div>

      {/* ── Itemized BDT Invoice Receipt ──────────────────────────────── */}
      {invoice && (
        <div className="card invoice" style={{ marginBottom: "var(--sp-4)", border: "1.5px solid var(--a-300)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
            <div>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>Itemized Invoice</h2>
              <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                Invoice #{invoice.invoice_no} · {new Date(invoice.issued_at).toLocaleDateString()}
              </p>
            </div>
            <span className="badge badge-completed">Paid / Completed</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
            {[
              ["Base Service Amount",  invoice.base_amount],
              ["Urgency Surcharge",    invoice.urgency_surcharge],
              ["Platform Service Fee", invoice.service_fee],
              ["Govt. VAT (5%)",       invoice.vat],
            ].map(([label, amount]) => amount > 0 && (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span className="text-muted">{label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>৳{amount}</span>
              </div>
            ))}

            <div
              style={{
                borderTop: "1.5px dashed var(--border)",
                paddingTop: "var(--sp-3)",
                marginTop: "var(--sp-1)",
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 800,
                fontSize: "var(--text-base)",
              }}
            >
              <span>Total Amount</span>
              <span style={{ color: "var(--a-500)", fontVariantNumeric: "tabular-nums", fontSize: "var(--text-lg)" }}>
                ৳{invoice.total}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Rating Card ──────────────────────────────────────── */}
      {req.rating > 0 && (
        <div className="card" style={{ marginBottom: "var(--sp-4)", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--warning-bg)", display: "grid", placeItems: "center" }}>
              <Icon name="star" size={18} color="var(--warning)" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>Your Experience Review</p>
              <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>You rated this service {req.rating} out of 5 stars</p>
            </div>
          </div>
          <StarRating value={req.rating} size={18} />
        </div>
      )}

      {/* ── Action Buttons ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-6)" }}>
        {canRate && (
          <button className="btn btn-primary" onClick={() => setShowRate(true)} style={{ gap: 6 }}>
            <Icon name="star" size={15} />
            <span>Rate This Service</span>
          </button>
        )}
        {canCancel && (
          <button className="btn btn-danger" onClick={() => setShowCancel(true)} style={{ gap: 6 }}>
            <Icon name="x" size={15} />
            <span>Cancel Request</span>
          </button>
        )}
        <Link to="/my-requests" className="btn btn-secondary" style={{ gap: 6 }}>
          <Icon name="list" size={15} />
          <span>All Bookings</span>
        </Link>
      </div>

      {/* Cancel Modal */}
      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel Booking?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCancel(false)}>
              Keep Booking
            </button>
            <button className="btn btn-danger" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? <span className="btn-loading" /> : "Confirm Cancellation"}
            </button>
          </>
        }
      >
        <p>Are you sure you want to cancel this booking? The assigned provider will be notified and your time slot released.</p>
      </Modal>

      {/* Rating Modal */}
      <Modal
        open={showRate}
        onClose={() => setShowRate(false)}
        title="Rate Your Provider"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowRate(false)}>
              Maybe Later
            </button>
            <button className="btn btn-primary" disabled={!rating || rating_loading} onClick={handleRate}>
              {rating_loading ? <span className="btn-loading" /> : "Submit Review"}
            </button>
          </>
        }
      >
        <div style={{ textAlign: "center", padding: "var(--sp-4) 0" }}>
          <p style={{ marginBottom: "var(--sp-4)", color: "var(--text-muted)" }}>
            How satisfied were you with {req.provider?.name ?? "the service"}?
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--sp-4)" }}>
            <StarRating value={rating} size={38} interactive onRate={setRating} />
          </div>
        </div>
      </Modal>

      {/* Release Payment Modal */}
      <Modal
        open={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        title="Release Payment to Provider"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowReleaseModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={releasing}
              onClick={handleReleasePayment}
              style={{ background: "var(--success)", borderColor: "var(--success)" }}
            >
              {releasing ? <span className="btn-loading" /> : `Confirm & Release ৳${req.estimated_price}`}
            </button>
          </>
        }
      >
        <div>
          <p style={{ marginBottom: "var(--sp-3)" }}>
            By releasing payment, you confirm that <strong>{req.provider?.name ?? "the provider"}</strong> has completed your <strong>{req.service_type}</strong> service satisfactorily.
          </p>
          <div style={{ padding: "var(--sp-3)", background: "var(--surface)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", marginBottom: 4 }}>
              <span className="text-muted">Payable Amount:</span>
              <span style={{ fontWeight: 700 }}>৳{req.estimated_price}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
              <span className="text-muted">Recipient:</span>
              <span style={{ fontWeight: 700 }}>{req.provider?.name}</span>
            </div>
          </div>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>
            Once confirmed, funds are immediately credited to the provider's earnings and an official receipt is issued.
          </p>
        </div>
      </Modal>

      {/* Dispute Modal */}
      <Modal
        open={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        title="Report Service Issue / Dispute"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDisputeModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={disputing}
              onClick={handleDispute}
              style={{ gap: 6, fontWeight: 700 }}
            >
              {disputing ? (
                <>
                  <span className="btn-loading" />
                  <span>Submitting to Admin...</span>
                </>
              ) : (
                <>
                  <Icon name="alert-circle" size={16} />
                  <span>Submit Report to Admin</span>
                </>
              )}
            </button>
          </>
        }
      >
        <div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--sp-3)" }}>
            If the work was left unfinished, defective, or not done at all, report it here. The platform Admin will inspect your report and proof photo to arbitrate escrow release or customer refund.
          </p>

          {/* Quick Select Chips */}
          <div style={{ marginBottom: "var(--sp-3)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Quick Select Problem Reason:
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                "Unfinished / Incomplete Work",
                "Defective or Damaged Service",
                "Technician Absent / No Show",
                "Overcharged / Incorrect Billing",
              ].map(reason => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDisputeNote(prev => prev ? `${prev}. ${reason}` : reason)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, height: "auto" }}
                >
                  + {reason}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "var(--sp-4)" }}>
            <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Explain the problem <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Describe in detail what was left unfinished, broken, or not done properly..."
              value={disputeNote}
              onChange={e => setDisputeNote(e.target.value)}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Attach Photo Proof (Recommended)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{ display: "block", fontSize: "var(--text-sm)", marginBottom: 8 }}
            />
            {disputeImage && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                <img
                  src={disputeImage}
                  alt="Proof preview"
                  style={{ width: 120, height: 80, objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}
                />
                <button
                  type="button"
                  onClick={() => setDisputeImage(null)}
                  className="btn btn-ghost btn-sm"
                  style={{ position: "absolute", top: -6, right: -6, background: "var(--danger)", color: "#fff", borderRadius: "50%", width: 20, height: 20, padding: 0, minWidth: 0 }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Photo Preview Modal */}
      {previewImage && (
        <Modal open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} title="Attached Photo Proof">
          <div style={{ textAlign: "center" }}>
            <img
              src={previewImage}
              alt="Preview full"
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
