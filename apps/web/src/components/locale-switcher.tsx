'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type Locale } from '@/i18n';
import { changeLocaleAction } from '@/app/actions';

/**
 * Language chooser. The locale is a cookie rather than a URL segment: the same listing
 * URL must be shareable between a Telugu and an English speaker and show each of them
 * their own language, and one canonical URL per listing is also what keeps the SEO clean.
 */
export function LocaleSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const startedNavigation = useRef(false);

  useEffect(() => {
    if (isPending) return;
    if (!startedNavigation.current) return;
    startedNavigation.current = false;
    window.dispatchEvent(new Event('locz:navigation-end'));
  }, [isPending]);

  return (
    <>
      <label htmlFor="locale-switcher" className="sr-only">
        {label}
      </label>
      <select
        id="locale-switcher"
        value={current}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          // The served locale is forced by any /te or /hi URL prefix (it wins over the cookie so
          // crawlers get each language), so a cookie change alone can't switch a prefixed URL —
          // we must navigate to the target locale's URL. Strip the current prefix to the neutral
          // path, then re-prefix for te/hi (English is the un-prefixed canonical).
          const neutral = pathname.replace(/^\/(te|hi)(?=\/|$)/, '') || '/';
          const target =
            next === DEFAULT_LOCALE ? neutral : `/${next}${neutral === '/' ? '' : neutral}`;
          startedNavigation.current = true;
          window.dispatchEvent(new Event('locz:navigation-start'));
          startTransition(async () => {
            await changeLocaleAction(next);
            router.push(target);
            router.refresh();
          });
        }}
        style={{
          font: 'inherit',
          fontSize: '0.875rem',
          padding: '6px 8px',
          borderRadius: 'var(--locz-radius-md)',
          border: '1px solid var(--locz-border-strong)',
          background: 'var(--locz-surface)',
          color: 'var(--locz-text)',
          minHeight: 40,
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </>
  );
}
