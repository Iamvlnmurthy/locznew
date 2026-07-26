'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { manageBusinessStaffAction, type BusinessStaffState } from '../../actions';

export interface BusinessStaff {
  id: string;
  userId: string;
  displayName: string;
  role: 'MANAGER' | 'EDITOR' | 'VIEWER';
  permissions: string[];
  acceptedAt: string | null;
}

function AddButton({ labels: m }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? m.addingAccess : m.addMember}
      <Icon name={pending ? 'clock' : 'plus'} />
    </button>
  );
}

export function StaffAccess({
  businessId,
  staff,
  labels: m,
}: {
  businessId: string;
  staff: BusinessStaff[];
  labels: Record<string, string>;
}) {
  const roles = [
    { value: 'MANAGER', label: m.manager, description: m.managerBody, summary: m.managerSummary },
    { value: 'EDITOR', label: m.editor, description: m.editorBody, summary: m.editorSummary },
    {
      value: 'VIEWER',
      label: m.responder,
      description: m.responderBody,
      summary: m.responderSummary,
    },
  ] as const;
  const boundAction = manageBusinessStaffAction.bind(null, businessId);
  const [state, action] = useActionState<BusinessStaffState, FormData>(boundAction, {});
  const [selectedRole, setSelectedRole] = useState('EDITOR');
  const [removingId, setRemovingId] = useState<string | null>(null);

  return (
    <section className="business-staff-panel">
      <header>
        <span>
          <Icon name="user" />
        </span>
        <div>
          <h2>{m.teamAccess}</h2>
          <p>{m.teamAccessBody}</p>
        </div>
        <strong>{m.peopleCount.replace('{count}', String(staff.length))}</strong>
      </header>

      {staff.length ? (
        <div className="business-staff-list">
          {staff.map((member) => (
            <article key={member.id}>
              <span>{member.displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{member.displayName}</strong>
                <small>
                  {roles.find((role) => role.value === member.role)?.label ?? member.role}
                </small>
              </div>
              <p>{roleSummary(member.role, roles, m)}</p>
              {removingId === member.id ? (
                <div className="business-staff-remove">
                  <span>{m.removeConfirm}</span>
                  <button type="button" onClick={() => setRemovingId(null)}>
                    {m.keepAccess}
                  </button>
                  <form action={action}>
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="staffId" value={member.id} />
                    <button type="submit">{m.removeAccess}</button>
                  </form>
                </div>
              ) : (
                <button
                  type="button"
                  className="business-staff-list__remove"
                  onClick={() => setRemovingId(member.id)}
                >
                  {m.remove}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="business-staff-empty">
          <Icon name="user" />
          <span>
            <strong>{m.onlyYou}</strong>
            {m.onlyYouBody}
          </span>
        </div>
      )}

      <form className="business-staff-add" action={action}>
        <input type="hidden" name="intent" value="add" />
        <div className="business-staff-add__intro">
          <span className="section-kicker">{m.addExisting}</span>
          <h3>{m.whoHelps}</h3>
          <p>{m.accessImmediate}</p>
        </div>
        <label>
          <span>{m.mobileNumber}</span>
          <div>
            <b>+91</b>
            <input name="phone" inputMode="numeric" maxLength={10} placeholder="98765 43210" />
          </div>
        </label>
        <fieldset>
          <legend>{m.chooseRole}</legend>
          <div>
            {roles.map((role) => (
              <label className={selectedRole === role.value ? 'is-selected' : ''} key={role.value}>
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={selectedRole === role.value}
                  onChange={() => setSelectedRole(role.value)}
                />
                <span>
                  <strong>{role.label}</strong>
                  <small>{role.description}</small>
                </span>
                <Icon name="check" />
              </label>
            ))}
          </div>
        </fieldset>
        <AddButton labels={m} />
      </form>

      {state.error ? (
        <p className="business-staff-message is-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="business-staff-message" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function roleSummary(
  role: BusinessStaff['role'],
  roles: ReadonlyArray<{ value: string; summary: string }>,
  labels: Record<string, string>,
): string {
  return roles.find((item) => item.value === role)?.summary ?? labels.customAccess;
}
