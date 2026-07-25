import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What LocZ collects, why, and what control you have over it.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="page-title">Privacy</h1>
      <p className="page-subtitle">Last updated 26 July 2026</p>

      <div className="alert alert--info">
        This is a plain-language draft written for launch. Have it reviewed against the Digital
        Personal Data Protection Act, 2023 before operating commercially.
      </div>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your mobile number</strong> — this is how you sign in. It is never shown on your
          ads unless you choose to display it.
        </li>
        <li>
          <strong>What you post</strong> — your listings, photos and messages.
        </li>
        <li>
          <strong>Location</strong> — the city you choose. If you allow precise location, we use it
          to sort results by distance; we do not keep a history of where you have been.
        </li>
        <li>
          <strong>Device and usage</strong> — device type, app version, IP address and what you
          viewed, used for security, abuse prevention and improving the service.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <p>
        We do not sell your personal data. We do not show your phone number to anyone unless you
        chose to publish it. And we strip the location data out of the photos you upload before
        anyone else can see them — a photo taken at home should not tell a stranger where you live.
      </p>

      <h2>Who can see what</h2>
      <p>
        Your listings, display name and the city you post in are public. Your phone number, email
        address and messages are not, unless you publish the number yourself.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Listings are removed when you delete them or when they expire. Messages are kept while the
        conversation exists. Security and moderation records are kept for a limited period so we can
        investigate abuse and settle disputes.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Change or delete anything you have posted, at any time.</li>
        <li>Turn off any category of notification.</li>
        <li>Sign out of one device, or all of them at once.</li>
        <li>Deactivate your account, which hides your content and is reversible.</li>
        <li>Request deletion, which removes your content and anonymises your record.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about your data: <a href="mailto:privacy@locz.in">privacy@locz.in</a>.
      </p>
    </>
  );
}
