'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

const STORAGE_KEY = 'locz_saved_businesses';

export function BookmarkBusiness({
  id,
  name,
  slug,
  cityName,
  categoryName,
}: {
  id: string;
  name: string;
  slug: string;
  cityName: string;
  categoryName: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          setSaved(items.some((item: { id: string }) => item.id === id));
        }
      }
    } catch {
      // ignore
    }
  }, [id]);

  function toggleSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) items = [];

      if (saved) {
        items = items.filter((item: { id: string }) => item.id !== id);
        setSaved(false);
      } else {
        items.unshift({ id, name, slug, cityName, categoryName, savedAt: Date.now() });
        setSaved(true);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggleSave}
      className={`business-profile-bookmark ${saved ? 'is-saved' : ''}`}
      aria-label={saved ? 'Remove from saved' : 'Save business'}
      title={saved ? 'Saved to your shortlist' : 'Save to shortlist'}
    >
      <Icon name="heart" />
      <span>{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}
