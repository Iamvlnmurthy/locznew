'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LoczLoader } from './locz-loader';

const START_EVENT = 'locz:navigation-start';
const END_EVENT = 'locz:navigation-end';
const SHOW_DELAY_MS = 120;
const FAILSAFE_MS = 12000;

export function NavigationFeedback({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<number | undefined>(undefined);
  const failsafeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (failsafeTimer.current) window.clearTimeout(failsafeTimer.current);
      showTimer.current = undefined;
      failsafeTimer.current = undefined;
    };
    const finish = () => {
      clearTimers();
      setVisible(false);
    };
    const start = () => {
      clearTimers();
      showTimer.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      failsafeTimer.current = window.setTimeout(finish, FAILSAFE_MS);
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== '_self') return;
      if (target.hasAttribute('download')) return;

      const next = new URL(target.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search &&
        next.hash
      ) {
        return;
      }
      if (next.href === window.location.href) return;
      start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() !== 'get') return;
      const action = new URL(form.action || window.location.href, window.location.href);
      if (action.origin === window.location.origin) start();
    };

    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener(START_EVENT, start);
    window.addEventListener(END_EVENT, finish);
    return () => {
      clearTimers();
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(END_EVENT, finish);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event(END_EVENT));
  }, [routeKey]);

  if (!visible) return null;

  return (
    <div className="locz-navigation-feedback" aria-hidden="false">
      <span className="locz-navigation-feedback__progress" aria-hidden="true" />
      <div className="locz-navigation-feedback__panel">
        <LoczLoader label={label} compact />
      </div>
    </div>
  );
}
