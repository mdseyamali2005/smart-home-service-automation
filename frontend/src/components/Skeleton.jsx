export default function Skeleton({ width, height = 20, borderRadius = "var(--r-sm)", style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width: width ?? "100%", height, borderRadius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <Skeleton height={18} width="55%" />
      {Array.from({ length: lines - 1 }, (_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 2 ? "40%" : "90%"} />
      ))}
    </div>
  );
}
