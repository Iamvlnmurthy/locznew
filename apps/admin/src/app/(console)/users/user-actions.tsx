'use client';

import { useState, useTransition } from 'react';
import { reinstateUserAction, suspendUserAction } from './actions';

export function UserActions({
  userId,
  status,
  displayName,
}: {
  userId: string;
  status: string;
  displayName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState<number | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSuspended = status === 'SUSPENDED';

  function handleReinstate() {
    if (!confirm(`Are you sure you want to reinstate ${displayName}?`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await reinstateUserAction(userId);
      if (res.error) setError(res.error);
      else setMessage(res.message ?? 'Reinstated');
    });
  }

  function handleSuspendSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason');
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await suspendUserAction(userId, reason, durationDays);
      if (res.error) {
        setError(res.error);
      } else {
        setMessage(res.message ?? 'Suspended');
        setShowSuspendModal(false);
        setReason('');
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {isSuspended ? (
          <button
            type="button"
            className="btn btn--outline"
            style={{ padding: '3px 8px', fontSize: '0.72rem', minHeight: '26px' }}
            onClick={handleReinstate}
            disabled={isPending}
          >
            {isPending ? 'Working…' : 'Reinstate'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--danger"
            style={{ padding: '3px 8px', fontSize: '0.72rem', minHeight: '26px' }}
            onClick={() => setShowSuspendModal(true)}
            disabled={isPending}
          >
            Suspend
          </button>
        )}
        <a
          href={`/audit?actorId=${userId}`}
          className="btn btn--ghost"
          style={{ padding: '3px 6px', fontSize: '0.72rem', minHeight: '26px' }}
          title="View Audit Logs"
        >
          Logs
        </a>
      </div>

      {error ? (
        <small style={{ color: 'var(--locz-danger, #ef4444)', fontSize: '0.68rem' }}>{error}</small>
      ) : null}
      {message ? <small style={{ color: '#10b981', fontSize: '0.68rem' }}>{message}</small> : null}

      {showSuspendModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowSuspendModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#ffffff',
              padding: 20,
              borderRadius: 12,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Suspend User</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b' }}>
              Suspend <strong>{displayName}</strong>. This immediately revokes all active sessions.
            </p>
            <form onSubmit={handleSuspendSubmit}>
              <div className="field">
                <label htmlFor={`reason-${userId}`}>Reason for suspension</label>
                <textarea
                  id={`reason-${userId}`}
                  required
                  minLength={3}
                  rows={3}
                  placeholder="e.g. Repeated scam listings or violating platform terms"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                  }}
                />
              </div>

              <div className="field">
                <label htmlFor={`duration-${userId}`}>Duration (optional)</label>
                <select
                  id={`duration-${userId}`}
                  value={durationDays ?? ''}
                  onChange={(e) =>
                    setDurationDays(e.target.value ? Number(e.target.value) : undefined)
                  }
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                  }}
                >
                  <option value="">Indefinite</option>
                  <option value="1">1 Day</option>
                  <option value="7">7 Days</option>
                  <option value="30">30 Days</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowSuspendModal(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--danger" disabled={isPending}>
                  {isPending ? 'Suspending…' : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
