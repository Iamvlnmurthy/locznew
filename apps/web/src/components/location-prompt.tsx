'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { selectCityAction } from '@/app/actions';
import { resolveCoordinatesAction } from '@/app/location/actions';

/**
 * On a visitor's first load with no location chosen, ask the browser for location once and, if
 * granted, resolve it to a city + pincode and store it — so the whole app is scoped to where they
 * actually are without them hunting for the picker. Denial is silent (the manual picker remains),
 * and we never re-prompt (a one-shot localStorage flag), so it is not nagging.
 */
export function LocationPrompt({ hasLocation }: { hasLocation: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (hasLocation || ran.current) return;
    ran.current = true;
    if (!('geolocation' in navigator) || localStorage.getItem('locz-geo-asked') === '1') return;
    localStorage.setItem('locz-geo-asked', '1');

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const resolved = await resolveCoordinatesAction(coords.latitude, coords.longitude);
          const { city, pincode } = resolved;
          if (!city && !pincode) return;
          await selectCityAction({
            id: city?.id ?? pincode?.cityId ?? '',
            name: city?.name ?? pincode?.cityName ?? pincode?.name ?? '',
            slug: city?.slug ?? '',
            latitude: coords.latitude,
            longitude: coords.longitude,
            pincode: pincode?.code,
          });
          router.refresh();
        } catch {
          /* leave the manual picker as the fallback */
        }
      },
      () => {
        /* denied or unavailable — the manual location control still works */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  }, [hasLocation, router]);

  return null;
}
