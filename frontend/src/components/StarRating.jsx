import Icon from "./Icon";

/** Reusable star rating display. Pass interactive=true + onRate for input mode. */
export default function StarRating({ value = 0, max = 5, size = 18, interactive = false, onRate, label = "Rating" }) {
  return (
    <div className="stars" role={interactive ? "group" : "img"} aria-label={`${label}: ${value} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(value);
        if (interactive) {
          return (
            <button
              key={i}
              type="button"
              className="star-btn"
              aria-label={`${i + 1} star${i > 0 ? "s" : ""}`}
              onClick={() => onRate?.(i + 1)}
            >
              <Icon
                name="star"
                size={size}
                strokeWidth={1.8}
                color={filled ? "var(--warning)" : "var(--n-300)"}
                style={{ fill: filled ? "var(--warning)" : "none" }}
              />
            </button>
          );
        }
        return (
          <Icon
            key={i}
            name="star"
            size={size}
            strokeWidth={1.8}
            color={filled ? "var(--warning)" : "var(--n-200)"}
          />
        );
      })}
    </div>
  );
}
