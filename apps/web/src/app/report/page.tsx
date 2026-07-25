import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ReportForm } from './report-form';

export const metadata: Metadata = {
  title: 'Report content',
  robots: { index: false, follow: false },
};

/**
 * Reporting form. Requires an account — anonymous reporting is trivially weaponised
 * against a competitor, and a report with no accountable reporter is worth little to a
 * moderator.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string; business?: string; user?: string }>;
}) {
  const [params, locale, currentUser] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentUser(),
  ]);

  const targetId = params.listing ?? params.business ?? params.user;
  const targetType = params.listing ? 'LISTING' : params.business ? 'BUSINESS' : 'USER';

  if (!targetId) redirect('/');
  if (!currentUser) {
    redirect(
      `/signin?next=${encodeURIComponent(`/report?${targetType.toLowerCase()}=${targetId}`)}`,
    );
  }

  const t = getTranslator(locale);

  // Shown for context so the reporter can confirm they are flagging the right thing.
  const listing = params.listing
    ? await apiSafe<{ title: string; slug: string }>(`/listings/${params.listing}`, { auth: true })
    : null;

  return (
    <div className="container">
      <ReportForm
        targetType={targetType}
        targetId={targetId}
        targetTitle={listing?.title ?? null}
        labels={{
          title: t('listing.report'),
          reason: 'Why are you reporting this?',
          details: 'Anything else we should know? (optional)',
          submit: 'Send report',
          submitting: 'Sending…',
          cancel: t('common.cancel'),
          success:
            'Thanks — our team will review this. We will let you know the outcome in your notifications.',
          reasons: {
            SPAM: 'Spam or repeated posting',
            FRAUD_OR_SCAM: 'Fraud or a scam',
            PROHIBITED_ITEM: 'Prohibited item or service',
            MISLEADING_PRICE: 'Misleading price',
            WRONG_CATEGORY: 'Posted in the wrong category',
            DUPLICATE: 'Duplicate of another ad',
            ALREADY_SOLD: 'Already sold or no longer available',
            OFFENSIVE_CONTENT: 'Offensive or inappropriate content',
            HARASSMENT: 'Harassment or abuse',
            OTHER: 'Something else',
          },
        }}
      />
    </div>
  );
}
