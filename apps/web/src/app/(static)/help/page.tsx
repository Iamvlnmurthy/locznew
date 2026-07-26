import type { Metadata } from 'next';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('helpPage.title'),
    description: t('helpPage.metadataDescription'),
    alternates: { canonical: '/help' },
  };
}

export default async function HelpPage() {
  const t = getTranslator(await getLocale());
  const faq = Array.from({ length: 8 }, (_, index) => ({
    question: t(`helpPage.q${index + 1}`),
    answer: t(`helpPage.a${index + 1}`),
  }));
  // FAQPage structured data — these are the exact questions people type into a search
  // engine, so it is worth being eligible for the rich result.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
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

      <h1 className="page-title">{t('helpPage.title')}</h1>

      <dl>
        {faq.map((entry) => (
          <div key={entry.question} style={{ marginBottom: 'var(--locz-space-6)' }}>
            <dt style={{ fontWeight: 600, marginBottom: 4 }}>{entry.question}</dt>
            <dd style={{ margin: 0, color: 'var(--locz-text-secondary)' }}>{entry.answer}</dd>
          </div>
        ))}
      </dl>

      <p>
        {t('helpPage.contact')} <a href="mailto:help@locz.in">help@locz.in</a>.
      </p>
    </>
  );
}
