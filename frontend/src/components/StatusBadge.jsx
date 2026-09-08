import Icon from "./Icon";

const STATUS_CONFIG = {
  "Requested":   { label: "Requested",   cls: "badge-requested",   icon: "clock" },
  "Accepted":    { label: "Accepted",    cls: "badge-accepted",    icon: "check" },
  "On the Way":  { label: "On the Way",  cls: "badge-on-the-way",  icon: "truck" },
  "In Progress": { label: "In Progress", cls: "badge-in-progress", icon: "wrench" },
  "Work Done":   { label: "Work Done · Pending Release", cls: "badge-work-done", icon: "clock" },
  "Completed":   { label: "Completed",   cls: "badge-completed",   icon: "check-circle" },
  "Disputed":    { label: "Under Dispute", cls: "badge-disputed",    icon: "alert-circle" },
  "Refunded":    { label: "Refunded",     cls: "badge-refunded",    icon: "refresh-cw" },
  "Rejected":    { label: "Rejected",    cls: "badge-rejected",    icon: "x-circle" },
  "Cancelled":   { label: "Cancelled",   cls: "badge-cancelled",   icon: "x" },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "badge-requested", icon: "info" };
  return (
    <span className={`badge ${cfg.cls}`} role="status">
      <Icon name={cfg.icon} size={12} strokeWidth={2.4} />
      {cfg.label}
    </span>
  );
}
