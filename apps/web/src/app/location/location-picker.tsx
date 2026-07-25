'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { City } from '@locz/shared-types';
import { selectCityAction } from '@/app/actions';
import { resolveCoordinatesAction, resolvePincodeAction } from './actions';

/**
 * City chooser.
 *
 * Precise location is offered, never required — a large share of users decline the
 * browser permission, and city-level browsing has to be a first-class path rather than
 * a fallback. Manual selection is therefore the default view, with GPS as one button.
 */
export function LocationPicker({
  cities,
  currentCityId,
  labels,
}: {
  cities: City[];
  currentCityId: string | null;
  labels: {
    useCurrent: string;
    searchCity: string;
    detecting: string;
    permissionDenied: string;
    outsideLaunchArea: string;
    pincodeLabel: string;
    pincodePlaceholder: string;
    pincodeApply: string;
    pincodeUnknown: string;
  };
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pincode, setPincode] = useState('');
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? cities.filter(
          (city) =>
            city.name.toLowerCase().includes(needle) ||
            city.nameTe?.includes(query) ||
            city.nameHi?.includes(query),
        )
      : cities;
    // Launched cities first — the rest are visible but clearly secondary.
    return [...matches].sort((a, b) => Number(b.isLaunched) - Number(a.isLaunched));
  }, [cities, query]);

  function choose(city: City) {
    startTransition(async () => {
      await selectCityAction({
        id: city.id,
        name: city.name,
        slug: city.slug,
        latitude: city.latitude,
        longitude: city.longitude,
      });
      router.push('/');
    });
  }

  /**
   * A pincode is the location most people can state without hesitating, and it costs no
   * browser permission. The code resolves to its centroid, and the area around that point
   * — not the code's own boundary — is what gets browsed.
   */
  function applyPincode() {
    const code = pincode.trim();

    startTransition(async () => {
      const resolved = await resolvePincodeAction(code);

      if (!resolved) {
        setPincodeError(labels.pincodeUnknown);
        return;
      }

      setPincodeError(null);
      await selectCityAction({
        // A pincode outside every launched city still browses fine by radius, so the city
        // fields stay empty rather than snapping to somewhere hundreds of kilometres away.
        id: resolved.cityId ?? '',
        name: resolved.cityName ?? `${resolved.name}, ${resolved.districtName}`,
        slug: '',
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        pincode: resolved.code,
      });
      router.push('/');
    });
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setStatus(labels.permissionDenied);
      return;
    }

    setStatus(labels.detecting);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        startTransition(async () => {
          const result = await resolveCoordinatesAction(
            position.coords.latitude,
            position.coords.longitude,
          );

          if (!result.city) {
            setStatus(labels.outsideLaunchArea);
            return;
          }

          await selectCityAction({
            id: result.city.id,
            name: result.city.name,
            slug: result.city.slug,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          router.push('/');
        });
      },
      () => setStatus(labels.permissionDenied),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={useCurrentLocation}
        disabled={isPending}
      >
        📍 {labels.useCurrent}
      </button>

      {status ? (
        <p className="field__hint" style={{ marginTop: 8 }} role="status">
          {status}
        </p>
      ) : null}

      <div className="field" style={{ marginTop: 20 }}>
        <label htmlFor="pincode">{labels.pincodeLabel}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="pincode"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder={labels.pincodePlaceholder}
            value={pincode}
            // Digits only: a numeric keypad still allows paste, and a stray letter would
            // fail server-side for no reason the user can see.
            onChange={(event) => {
              setPincode(event.target.value.replace(/\D/g, '').slice(0, 6));
              setPincodeError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && pincode.length === 6) applyPincode();
            }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={applyPincode}
            disabled={isPending || pincode.length !== 6}
          >
            {labels.pincodeApply}
          </button>
        </div>
        {pincodeError ? (
          <p className="field__error" role="alert">
            {pincodeError}
          </p>
        ) : null}
      </div>

      <div className="field" style={{ marginTop: 24 }}>
        <label htmlFor="city-search">{labels.searchCity}</label>
        <input
          id="city-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
        {filtered.map((city) => (
          <li key={city.id}>
            <button
              type="button"
              onClick={() => choose(city)}
              disabled={isPending}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 16px',
                border: '1px solid var(--locz-border)',
                borderRadius: 'var(--locz-radius-md)',
                background:
                  city.id === currentCityId ? 'var(--locz-primary-soft)' : 'var(--locz-surface)',
                font: 'inherit',
                cursor: 'pointer',
                minHeight: 48,
                color: 'var(--locz-text)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{city.name}</span>
              <span style={{ color: 'var(--locz-text-muted)', fontSize: '0.875rem' }}>
                {' '}
                · {city.stateName}
              </span>
              {!city.isLaunched ? (
                <span className="badge badge--status" style={{ marginLeft: 8 }}>
                  soon
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
