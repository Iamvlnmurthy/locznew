'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { rebuildIndexAction, type RebuildState } from './actions';

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? 'Queueing…' : 'Rebuild search index'}
    </button>
  );
}

export function RebuildIndexButton() {
  const [state, action] = useActionState<RebuildState, FormData>(rebuildIndexAction, {});

  return (
    <form action={action}>
      <Button />
      {state.message ? (
        <p className="metric__hint" style={{ marginTop: 8, color: 'var(--locz-success)' }}>
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p className="metric__hint" style={{ marginTop: 8, color: 'var(--locz-danger)' }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
