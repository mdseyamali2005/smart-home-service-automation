/**
 * MatchConfirmation — Shows top ranked providers and lets the customer confirm booking.
 * Calls /api/service-requests on confirm, then redirects to tracking page.
 */

import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import ProviderCard from '../components/ProviderCard';
import { createServiceRequest } from '../api';

export default function MatchConfirmation({ addToast }) {
  const location = useLocation();
  const navigate = useNavigate();
  const matchData = location.state;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If no match data (direct URL access), redirect to home
  if (!matchData || !matchData.candidates) {
    return (
      <div className="app-container page-content">
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No Match Data</h3>
          <p>Please start by selecting a service category.</p>
          <Link to="/" className="btn btn-primary mt-lg">Go to Home</Link>
        </div>
      </div>
    );
  }

  const { candidates, request } = matchData;
  const selectedCandidate = candidates[selectedIndex];

  const handleConfirm = async () => {
    if (!selectedCandidate) return;

    setLoading(true);
    setError('');

    try {
      const result = await createServiceRequest({
        ...request,
        chosen_provider_id: selectedCandidate.provider.id,
      });

      if (addToast) {
        addToast(
          'Booking Confirmed! 🎉',
          `${selectedCandidate.provider.name} has been assigned to your request.`,
          'success'
        );
      }

      // Navigate to tracking page
      navigate(`/track/${result.id}`);
    } catch (err) {
      if (err.status === 409) {
        setError('This slot was just booked. Please go back and try again.');
        if (addToast) {
          addToast('Slot Unavailable', 'The slot was taken. Try another provider.', 'warning');
        }
      } else {
        setError(err.message || 'Failed to confirm booking. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container page-content">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>›</span>
        <Link to={`/request/${encodeURIComponent(request.service_type)}`}>
          {request.service_type}
        </Link>
        <span>›</span>
        <span>Match Results</span>
      </div>

      <div className="page-header">
        <h1>🎯 Best Matches Found</h1>
        <p>
          We found {candidates.length} provider{candidates.length > 1 ? 's' : ''} for your {request.service_type} request.
          Select one to confirm your booking.
        </p>
      </div>

      {/* Request Summary */}
      <div className="card-glass mb-lg" style={{ maxWidth: '700px' }}>
        <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-lg)' }}>📋 Request Summary</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 'var(--space-md)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Service</div>
            <div style={{ fontWeight: 500 }}>{request.service_type}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Location</div>
            <div style={{ fontWeight: 500 }}>{request.location.address}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</div>
            <div style={{ fontWeight: 500 }}>
              {new Date(request.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</div>
            <div style={{ fontWeight: 500 }}>{request.time_slot}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Urgency</div>
            <div style={{ fontWeight: 500 }}>{request.urgency}</div>
          </div>
        </div>
        {request.problem_details && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Problem</div>
            <div style={{ fontWeight: 500 }}>{request.problem_details}</div>
          </div>
        )}
      </div>

      {/* Provider Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 'var(--space-lg)',
        maxWidth: '700px',
      }}>
        {candidates.map((candidate, idx) => (
          <ProviderCard
            key={candidate.provider.id}
            candidate={candidate}
            isSelected={idx === selectedIndex}
            onSelect={() => setSelectedIndex(idx)}
          />
        ))}
      </div>

      {/* Confirm Button */}
      <div style={{ maxWidth: '700px', marginTop: 'var(--space-xl)' }}>
        {error && (
          <div style={{
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#EF4444',
            fontSize: 'var(--font-sm)',
            marginBottom: 'var(--space-md)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <button
            className="btn btn-accent btn-lg"
            style={{ flex: 1 }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                Confirming...
              </>
            ) : (
              `✅ Confirm Booking with ${selectedCandidate.provider.name}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
