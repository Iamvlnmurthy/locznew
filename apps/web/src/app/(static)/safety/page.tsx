import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staying safe on LocZ',
  description:
    'How to buy and sell safely on LocZ: meeting in person, spotting scams, protecting your number and reporting problems.',
  alternates: { canonical: '/safety' },
};

/**
 * The safety page earns its place: the advice here is what actually prevents the fraud
 * the moderation rules are built around. It is written as habits, not warnings.
 */
export default function SafetyPage() {
  return (
    <>
      <h1 className="page-title">Staying safe</h1>
      <p className="page-subtitle">
        Most people on LocZ are genuine. These habits protect you from the few who are not.
      </p>

      <h2>Never pay in advance</h2>
      <p>
        This is the single most common scam. Anyone who asks for a deposit, a booking fee, a
        registration charge or a &ldquo;refundable&rdquo; payment before you have seen the item is
        almost certainly trying to steal from you. Genuine sellers are paid when you meet. The same
        applies to jobs: a real employer never charges you to apply.
      </p>

      <h2>Meet in a public place</h2>
      <p>
        Meet during the day, somewhere busy — a metro station, a mall, a market. Take someone with
        you if you can. Do not invite a stranger to your home, and do not go alone to an address you
        have never heard of.
      </p>

      <h2>Inspect before you pay</h2>
      <p>
        Switch the phone on. Start the bike. Check the serial number. Ask for the bill or warranty
        card. A seller who resists a reasonable inspection is telling you something.
      </p>

      <h2>Keep your number private</h2>
      <p>
        You do not have to share your phone number. LocZ messages let you talk to a buyer or seller
        without either of you giving anything away, and your number stays hidden unless you choose
        to display it on your ad.
      </p>

      <h2>Be careful with links and UPI</h2>
      <p>
        Never open a shortened link a stranger sends you. And never enter your UPI PIN to{' '}
        <em>receive</em> money — a PIN is only ever needed to send it. Anyone telling you otherwise
        is stealing from you.
      </p>

      <h2>Report anything wrong</h2>
      <p>
        Every ad has a <strong>Report this ad</strong> link. Reports go to a real person, and
        several reports about the same ad pull it out of public view while we look. You will be told
        the outcome in your notifications.
      </p>
    </>
  );
}
