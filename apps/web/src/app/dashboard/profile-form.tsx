'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { updateProfileAction, type ProfileState } from './actions';

interface Profile {
  displayName: string;
  email: string | null;
  bio: string | null;
  preferredLanguage: string;
  phone: string;
}

function SaveProfileButton({ labels: d }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? d.saving : d.saveChanges} {!pending ? <Icon name="arrow" /> : null}
    </button>
  );
}

export function ProfileForm({
  profile,
  labels: d,
}: {
  profile: Profile;
  labels: Record<string, string>;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(updateProfileAction, {});

  return (
    <form className="dashboard-profile-form" action={action}>
      {state.ok ? (
        <div className="alert alert--success" role="status">
          {d.profileUpdated}
        </div>
      ) : null}
      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="dashboard-profile-form__row">
        <div className="field">
          <label htmlFor="dashboard-name">{d.displayName}</label>
          <input
            id="dashboard-name"
            name="displayName"
            type="text"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile.displayName}
          />
        </div>
        <div className="field">
          <label htmlFor="dashboard-email">{d.email}</label>
          <input
            id="dashboard-email"
            name="email"
            type="email"
            defaultValue={profile.email ?? ''}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="dashboard-bio">{d.aboutYou}</label>
        <textarea
          id="dashboard-bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={profile.bio ?? ''}
          placeholder={d.bioPlaceholder}
        />
        <p className="field__hint">{d.bioHint}</p>
      </div>

      <div className="dashboard-profile-form__row">
        <div className="field">
          <label htmlFor="dashboard-language">{d.preferredLanguage}</label>
          <select
            id="dashboard-language"
            name="preferredLanguage"
            defaultValue={profile.preferredLanguage}
          >
            <option value="EN">{d.english}</option>
            <option value="TE">తెలుగు</option>
            <option value="HI">हिन्दी</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="dashboard-phone">{d.phone}</label>
          <input id="dashboard-phone" value={profile.phone} disabled readOnly />
          <p className="field__hint">{d.verifiedSignIn}</p>
        </div>
      </div>

      <div className="dashboard-profile-form__actions">
        <SaveProfileButton labels={d} />
      </div>
    </form>
  );
}
