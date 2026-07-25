import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The rules for using LocZ.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <>
      <h1 className="page-title">Terms of use</h1>
      <p className="page-subtitle">Last updated 26 July 2026</p>

      {/* Said plainly rather than buried: this is a developer's draft, and shipping it
          unreviewed would be a real legal exposure for whoever operates LocZ. */}
      <div className="alert alert--info">
        This is a plain-language draft written for launch. Have it reviewed by a lawyer familiar
        with the Information Technology Act and the Consumer Protection (E-Commerce) Rules before
        operating commercially.
      </div>

      <h2>Who may use LocZ</h2>
      <p>
        You must be 18 or older and provide a working Indian mobile number. One person, one account.
      </p>

      <h2>What you may post</h2>
      <p>
        Only things you are legally entitled to sell, offer or advertise, described honestly, at a
        real price, in the right category and in the right place. You are responsible for your
        listings and for the transactions you enter into.
      </p>

      <h2>What you may not post</h2>
      <p>
        Weapons, drugs, wildlife, counterfeit goods, stolen property, identity documents,
        prescription medicines, adult services, financial products you are not licensed to offer, or
        anything prohibited by Indian law. No spam, no misleading prices, no advance-fee schemes,
        and no impersonating another person or business.
      </p>

      <h2>LocZ is a platform, not a party to your deal</h2>
      <p>
        We connect buyers and sellers. We do not own, inspect, guarantee or deliver anything listed
        here, we hold no payments, and we are not a party to any agreement you make. As an
        intermediary we act on notice: report something and we will review it.
      </p>

      <h2>Moderation</h2>
      <p>
        We may review, refuse, pause or remove any listing, and suspend an account, where our rules
        or the law require it. Where we remove something we tell you why, and you can ask us to look
        again.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you post. You give us permission to display, resize and
        distribute it for the purpose of running and promoting LocZ.
      </p>

      <h2>Ending your use</h2>
      <p>
        You may delete your account at any time. We may close an account that repeatedly breaches
        these terms.
      </p>
    </>
  );
}
