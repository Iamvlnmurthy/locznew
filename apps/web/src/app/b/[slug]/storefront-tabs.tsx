'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

interface StorefrontTab {
  id: string;
  icon: string;
  label: string;
}

export function StorefrontTabs({ label, items }: { label: string; items: StorefrontTab[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? 'about');
  const sectionIds = items.map(({ id }) => id).join('|');

  useEffect(() => {
    const sections = sectionIds
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: '-22% 0px -62% 0px', threshold: [0, 0.15, 0.4] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  return (
    <nav className="business-profile-tabs" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={activeId === item.id ? 'is-active' : undefined}
          aria-current={activeId === item.id ? 'location' : undefined}
          onClick={() => setActiveId(item.id)}
        >
          <Icon name={item.icon} /> {item.label}
        </a>
      ))}
    </nav>
  );
}
