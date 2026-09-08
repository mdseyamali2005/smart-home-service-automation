import { useState, useEffect, useCallback } from "react";
import { myJobs, updateStatus } from "../api";
import { useToast } from "../context/ToastContext";
import StatusBadge from "../components/StatusBadge";
import Skeleton from "../components/Skeleton";
import Icon from "../components/Icon";
import Modal from "../components/Modal";

const URGENCY_COLOR = { Normal: "var(--info)", Urgent: "var(--warning)", Emergency: "var(--danger)" };
const URGENCY_ORDER = { Emergency: 0, Urgent: 1, Normal: 2 };

// Map current status → provider action label + next status
const PROVIDER_ACTIONS = {
  "Requested":   [{ label: "Accept Job",  next: "Accepted",   style: "btn-primary" }, { label: "Decline", next: "Rejected", style: "btn-danger" }],
  "Accepted":    [{ label: "On the Way", next: "On the Way", style: "btn-primary" }],
  "On the Way":  [{ label: "Start Work", next: "In Progress", style: "btn-primary" }],
  "In Progress": [{ label: "Mark Work Completed", next: "Work Done", style: "btn-primary" }],
};

function JobCard({ job, onAction, onPreviewImage }) {
  const [loading, setLoading] = useState(null);
  const actions = PROVIDER_ACTIONS[job.status] ?? [];

  async function handle(next) {
    setLoading(next);
    await onAction(job.id, next);
    setLoading(null);
  }

  return (
    <div className="card job-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-1)" }}>
            <span style={{ fontWeight: 700 }}>{job.service_type ?? "Service"}</span>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: URGENCY_COLOR[job.urgency], padding: "1px 7px", borderRadius: "var(--r-full)", background: `${URGENCY_COLOR[job.urgency]}18` }}>
              {job.urgency}
            </span>
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {job.customer_name}
            {job.date && ` · ${job.date}`}
            {job.time_slot && ` ${job.time_slot}`}
          </p>
          {job.problem_details && (
            <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--sp-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {job.problem_details}
            </p>
          )}

          {job.image_url && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <Icon name="image" size={13} color="var(--a-500)" />
                Issue Photo Attached by Customer
              </span>
              <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                <img
                  src={job.image_url}
                  alt="Customer issue preview"
                  onClick={() => onPreviewImage?.(job.image_url)}
                  style={{
                    width: 140,
                    height: 96,
                    objectFit: "cover",
                    borderRadius: "var(--r-md)",
                    border: "1.5px solid var(--border)",
                    cursor: "pointer",
                    boxShadow: "var(--shadow-sm)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => onPreviewImage?.(job.image_url)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 0", height: "auto", fontSize: 11, color: "var(--a-600)", fontWeight: 600, justifyContent: "flex-start", gap: 4 }}
                >
                  <Icon name="search" size={12} /> Click to expand
                </button>
              </div>
            </div>
          )}
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === "Work Done" && (
        <div style={{ marginTop: "var(--sp-3)", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "hsl(35, 90%, 30%)", fontWeight: 700, background: "hsl(45, 100%, 94%)", padding: "8px 12px", borderRadius: "var(--r-md)", border: "1.5px solid hsl(45, 90%, 70%)" }}>
          <Icon name="clock" size={16} color="hsl(35, 90%, 30%)" />
          <span>Work marked completed. Waiting for customer inspection & payment release.</span>
        </div>
      )}

      {job.status === "Disputed" && (
        <div style={{ marginTop: "var(--sp-3)", display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-xs)", color: "var(--danger)", background: "var(--danger-bg)", padding: "10px 12px", borderRadius: "var(--r-md)", border: "1.5px solid hsl(0, 85%, 75%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
            <Icon name="alert-circle" size={16} color="var(--danger)" />
            <span>Dispute Reported by Customer · Under Admin Review</span>
          </div>
          {job.dispute_note && (
            <p style={{ color: "var(--text-body)", fontSize: 12, marginTop: 2 }}>
              <strong>Customer Note:</strong> "{job.dispute_note}"
            </p>
          )}
          {job.dispute_image_url && (
            <button
              type="button"
              onClick={() => onPreviewImage?.(job.dispute_image_url)}
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 0", height: "auto", fontSize: 11, color: "var(--danger)", fontWeight: 700, justifyContent: "flex-start", gap: 4 }}
            >
              <Icon name="image" size={12} /> View Customer's Proof Photo
            </button>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
          {actions.map(a => (
            <button key={a.next} className={`btn btn-sm ${a.style}`}
              disabled={loading !== null}
              onClick={() => handle(a.next)}>
              {loading === a.next ? <span className="btn-loading" /> : a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProviderJobs() {
  const { success, error } = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [previewImage, setPreviewImage] = useState(null);

  const load = useCallback(() => {
    myJobs().then(setJobs).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id, next) {
    try {
      await updateStatus(id, next);
      success(`Status updated to ${next}`);
      load();
    } catch (e) {
      error(e.detail ?? "Failed to update status.");
    }
  }

  const TERMINAL = new Set(["Completed", "Cancelled", "Rejected", "Refunded"]);
  const active = jobs.filter(j => !TERMINAL.has(j.status));
  const done = jobs.filter(j => TERMINAL.has(j.status));

  const displayed = filter === "active" ? [...active].sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9)) : done;

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-8)" }}>
        <h1>My Jobs</h1>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button className={`btn btn-sm ${filter === "active" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("active")}>
            Active {active.length > 0 && <span style={{ fontVariantNumeric: "tabular-nums" }}>({active.length})</span>}
          </button>
          <button className={`btn btn-sm ${filter === "history" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("history")}>
            History
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card">
              <Skeleton height={16} width="50%" style={{ marginBottom: "var(--sp-3)" }} />
              <Skeleton height={13} width="70%" style={{ marginBottom: "var(--sp-4)" }} />
              <Skeleton height={32} width={120} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="empty-state">
          <Icon name="briefcase" size={48} color="var(--text-muted)" />
          <p style={{ fontWeight: 600 }}>{filter === "active" ? "No active jobs" : "No job history yet"}</p>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
            {filter === "active" ? "New requests will appear here." : "Completed and cancelled jobs will show here."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          {displayed.map(j => (
            <JobCard key={j.id} job={j} onAction={handleAction} onPreviewImage={setPreviewImage} />
          ))}
        </div>
      )}

      {/* Customer Issue Photo Preview Modal */}
      {previewImage && (
        <Modal open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} title="Customer Issue Photo">
          <div style={{ textAlign: "center" }}>
            <img
              src={previewImage}
              alt="Issue full preview"
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
