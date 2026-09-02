'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { selectCityAction } from '@/app/actions';
import { resolveCoordinatesAction } from '@/app/location/actions';

/**
 * Reuse location only when the visitor has already granted browser permission. Permission prompts
 * must follow an explicit press on the location page; surprising somebody on first paint produces
 * more denials and leaves no room to explain why LocZ is asking.
 */
export function LocationPrompt({ hasLocation }: { hasLocation: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (hasLocation || ran.current) return;
    ran.current = true;
    if (!('geolocation' in navigator) || !navigator.permissions) return;

    const resolveGrantedLocation = () =>
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
        () => undefined,
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
      );

    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (permission.state === 'granted') resolveGrantedLocation();
      })
      .catch(() => undefined);
  }, [hasLocation, router]);

  return null;
}
