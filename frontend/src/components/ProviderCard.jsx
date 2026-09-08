/**
 * ProviderCard — Displays provider info with rating, distance, price, and match score.
 * Used in the MatchConfirmation page to show ranked candidates.
 */

export default function ProviderCard({ candidate, isSelected, onSelect }) {
  const { provider, match_score, estimated_price, distance_km } = candidate;

  return (
    <div
      className={`provider-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div className="provider-header">
        <div>
          <h3 className="provider-name">{provider.name}</h3>
          <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
            📍 {provider.location.address}
          </p>
        </div>
        <span className="provider-match-score">
          {Math.round(match_score * 100)}% match
        </span>
      </div>

      <div className="provider-stats">
        <div className="provider-stat">
          <span className="stat-label">Rating</span>
          <span className="stat-value rating">⭐ {provider.rating.toFixed(1)}</span>
        </div>
        <div className="provider-stat">
          <span className="stat-label">Distance</span>
          <span className="stat-value">{distance_km.toFixed(1)} km</span>
        </div>
        <div className="provider-stat">
          <span className="stat-label">Est. Price</span>
          <span className="stat-value price">৳{estimated_price.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'var(--space-sm)' }}>
        {provider.expertise_tags.slice(0, 3).map(tag => (
          <span
            key={tag}
            style={{
              fontSize: 'var(--font-xs)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(79, 70, 229, 0.1)',
              color: 'var(--primary-light)',
              border: '1px solid rgba(79, 70, 229, 0.2)',
            }}
          >
            {tag.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {isSelected && (
        <div style={{
          marginTop: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'rgba(79, 70, 229, 0.1)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-sm)',
          color: 'var(--primary-light)',
          textAlign: 'center',
          fontWeight: 600,
        }}>
          ✓ Selected
        </div>
      )}
    </div>
  );
}
