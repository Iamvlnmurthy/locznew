import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ReportForm } from './report-form';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: getMessageGroup(locale, 'reportUi').pageTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Reporting form. Requires an account — anonymous reporting is trivially weaponised
 * against a competitor, and a report with no accountable reporter is worth little to a
 * moderator.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    listing?: string;
    business?: string;
    user?: string;
    conversation?: string;
  }>;
}) {
  const [params, locale, currentUser] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentUser(),
  ]);

  const targetId = params.listing ?? params.business ?? params.user ?? params.conversation;
  const targetType = params.listing
    ? 'LISTING'
    : params.business
      ? 'BUSINESS'
      : params.conversation
        ? 'MESSAGE'
        : 'USER';

  if (!targetId) redirect('/');
  if (!currentUser) {
    redirect(
      `/signin?next=${encodeURIComponent(
        params.conversation
          ? `/report?conversation=${targetId}`
          : `/report?${targetType.toLowerCase()}=${targetId}`,
      )}`,
    );
  }

  const labels = getMessageGroup(locale, 'reportUi');

  // Shown for context so the reporter can confirm they are flagging the right thing.
  const listing = params.listing
    ? await apiSafe<{ title: string; slug: string }>(`/listings/${params.listing}`, { auth: true })
    : null;

  return (
    <main className="report-experience">
      <div className="container report-experience__layout">
        <aside className="report-experience__context">
          <span className="section-kicker">{labels.kicker}</span>
          <h1>{labels.pageTitle}</h1>
          <p>{labels.pageBody}</p>
          <div className="report-experience__promise">
            <span aria-hidden="true">24/7</span>
            <p>
              <strong>{labels.privateTitle}</strong>
              {labels.privateBody}
            </p>
          </div>
        </aside>
        <ReportForm
          targetType={targetType}
          targetId={targetId}
          targetTitle={listing?.title ?? null}
          labels={{
            title: labels.formTitle,
            reason: labels.reason,
            details: labels.details,
            submit: labels.submit,
            submitting: labels.submitting,
            cancel: labels.cancel,
            success: labels.success,
            successTitle: labels.successTitle,
            reasons: {
              SPAM: labels.reasonSpam,
              FRAUD_OR_SCAM: labels.reasonFraud,
              PROHIBITED_ITEM: labels.reasonProhibited,
              MISLEADING_PRICE: labels.reasonPrice,
              WRONG_CATEGORY: labels.reasonCategory,
              DUPLICATE: labels.reasonDuplicate,
              ALREADY_SOLD: labels.reasonSold,
              OFFENSIVE_CONTENT: labels.reasonOffensive,
              HARASSMENT: labels.reasonHarassment,
              OTHER: labels.reasonOther,
            },
          }}
        />
      </div>
    </main>
  );
}
