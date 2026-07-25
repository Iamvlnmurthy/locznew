import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Answers to common questions about posting, editing and managing ads on LocZ.',
  alternates: { canonical: '/help' },
};

const FAQ = [
  {
    question: 'Does it cost anything to post?',
    answer:
      'No. Posting ads, jobs, offers and business profiles is free, and there is no charge to be found in search.',
  },
  {
    question: 'Why is my ad "under review"?',
    answer:
      'The first ads from every new account are checked by a person before they go live — usually within a few hours. It is how we keep spam off the site. After that, most ads publish immediately.',
  },
  {
    question: 'Why was my ad not approved?',
    answer:
      'You will see the reason on the ad under My ads. The usual causes are contact details written into the description instead of the contact fields, a shortened link, or a duplicate of an ad you already have live. Fix it and submit again.',
  },
  {
    question: 'How long does an ad stay live?',
    answer:
      'Marketplace ads and jobs run for 30 days, buyer requirements for 15 and rentals for 45. Offers and events run until the end date you set. We remind you before an ad expires, and republishing takes one tap.',
  },
  {
    question: 'Can I hide my phone number?',
    answer:
      'Yes, and it is hidden by default. Choose "Messages on LocZ only" when posting and buyers can still reach you without seeing your number.',
  },
  {
    question: 'How do I mark something as sold?',
    answer: 'Open My ads and tap Mark as sold. The ad stops appearing in search straight away.',
  },
  {
    question: 'Someone is behaving badly. What do I do?',
    answer:
      'Use Report this ad, or block them from the conversation. Blocking stops contact in both directions immediately.',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Account, then delete account. Your ads are removed straight away. We keep a minimal record for a short period so we can handle any dispute, then anonymise it.',
  },
];

export default function HelpPage() {
  // FAQPage structured data — these are the exact questions people type into a search
  // engine, so it is worth being eligible for the rich result.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <h1 className="page-title">Help</h1>

      <dl>
        {FAQ.map((entry) => (
          <div key={entry.question} style={{ marginBottom: 'var(--locz-space-6)' }}>
            <dt style={{ fontWeight: 600, marginBottom: 4 }}>{entry.question}</dt>
            <dd style={{ margin: 0, color: 'var(--locz-text-secondary)' }}>{entry.answer}</dd>
          </div>
        ))}
      </dl>

      <p>
        Still stuck? Write to <a href="mailto:help@locz.in">help@locz.in</a>.
      </p>
    </>
  );
}
