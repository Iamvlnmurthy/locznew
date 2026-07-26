'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { City } from '@locz/shared-types';
import { searchCitiesAction, selectCityAction } from '@/app/actions';
import { Icon } from '@/components/icons';
import { resolveCoordinatesAction, resolvePincodeAction } from './actions';

interface LocationLabels {
  useCurrent: string;
  searchCity: string;
  detecting: string;
  permissionDenied: string;
  outsideLaunchArea: string;
  pincodeLabel: string;
  pincodePlaceholder: string;
  pincodeApply: string;
  pincodeUnknown: string;
  gpsHint: string;
  pincodeHint: string;
  citiesLabel: string;
  liveNow: string;
  comingSoon: string;
  selected: string;
  noCityMatches: string;
  openingArea: string;
}

export function LocationPicker({
  cities,
  currentCityId,
  labels,
}: {
  cities: City[];
  currentCityId: string | null;
  labels: LocationLabels;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pincode, setPincode] = useState('');
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [activeChoice, setActiveChoice] = useState<string | null>(null);
  const [cityResults, setCityResults] = useState(cities);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? cityResults.filter(
          (city) =>
            city.name.toLowerCase().includes(needle) ||
            city.nameTe?.includes(query) ||
            city.nameHi?.includes(query),
        )
      : cityResults;
    return [...matches].sort((a, b) => {
      if (a.id === currentCityId) return -1;
      if (b.id === currentCityId) return 1;
      return Number(b.isLaunched) - Number(a.isLaunched);
    });
  }, [cityResults, currentCityId, query]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;

    let current = true;
    const timer = window.setTimeout(() => {
      void searchCitiesAction(needle, true).then((matches) => {
        if (!current) return;
        setCityResults(matches);
        setIsSearching(false);
      });
    }, 250);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [cities, query]);

  function choose(city: City) {
    if (!city.isLaunched) return;
    setActiveChoice(city.id);
    setStatus(`${labels.openingArea} ${city.name}…`);
    startTransition(async () => {
      await selectCityAction({
        id: city.id,
        name: city.name,
        slug: city.slug,
        latitude: city.latitude,
        longitude: city.longitude,
      });
      router.replace('/');
    });
  }

  function applyPincode() {
    const code = pincode.trim();

    setActiveChoice('pincode');
    setStatus(null);
    startTransition(async () => {
      const resolved = await resolvePincodeAction(code);
      if (!resolved) {
        setPincodeError(labels.pincodeUnknown);
        setActiveChoice(null);
        return;
      }

      setPincodeError(null);
      const resolvedCity = cities.find((city) => city.id === resolved.cityId);
      await selectCityAction({
        id: resolved.cityId ?? '',
        name: resolved.cityName ?? `${resolved.name}, ${resolved.districtName}`,
        slug: resolvedCity?.slug ?? '',
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        pincode: resolved.code,
      });
      router.replace('/');
    });
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setStatus(labels.permissionDenied);
      return;
    }

    setActiveChoice('gps');
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
            setActiveChoice(null);
            return;
          }

          await selectCityAction({
            id: result.city.id,
            name: result.city.name,
            slug: result.city.slug,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            pincode: result.pincode?.code,
          });
          router.replace('/');
        });
      },
      () => {
        setStatus(labels.permissionDenied);
        setActiveChoice(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <div className="location-picker">
      <button
        type="button"
        className="location-picker__gps"
        onClick={useCurrentLocation}
        disabled={isPending}
        aria-busy={isPending && activeChoice === 'gps'}
      >
        <span>
          <Icon name="location" width="21" height="21" />
        </span>
        <span>
          <strong>{labels.useCurrent}</strong>
          <small>{isPending && activeChoice === 'gps' ? labels.detecting : labels.gpsHint}</small>
        </span>
        <Icon name="arrow" width="18" height="18" />
      </button>

      {status ? (
        <p className="location-picker__status" role="status">
          {status}
        </p>
      ) : null}

      <div className="location-picker__divider">
        <span>{labels.pincodeLabel}</span>
      </div>

      <div className="location-picker__pincode">
        <label className="location-picker__input" htmlFor="pincode">
          <Icon name="location" width="18" height="18" />
          <input
            id="pincode"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder={labels.pincodePlaceholder}
            value={pincode}
            onChange={(event) => {
              setPincode(event.target.value.replace(/\D/g, '').slice(0, 6));
              setPincodeError(null);
              setStatus(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && pincode.length === 6) applyPincode();
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={applyPincode}
          disabled={isPending || pincode.length !== 6}
          aria-busy={isPending && activeChoice === 'pincode'}
        >
          {isPending && activeChoice === 'pincode' ? `${labels.openingArea}…` : labels.pincodeApply}
        </button>
      </div>
      <p className="location-picker__privacy">
        <Icon name="shield" width="13" height="13" /> {labels.pincodeHint}
      </p>
      {pincodeError ? (
        <p className="field__error" role="alert">
          {pincodeError}
        </p>
      ) : null}

      <div className="location-picker__cities-head">
        <strong>{labels.citiesLabel}</strong>
        <span>
          {cities.filter((city) => city.isLaunched).length} {labels.liveNow}
        </span>
      </div>

      <label className="location-picker__city-search" htmlFor="city-search">
        <Icon name="search" width="18" height="18" />
        <input
          id="city-search"
          type="search"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (nextQuery.trim().length < 2) {
              setCityResults(cities);
              setIsSearching(false);
            } else {
              setIsSearching(true);
            }
          }}
          autoComplete="off"
          placeholder={labels.searchCity}
          aria-busy={isSearching}
        />
        {isSearching ? <span className="city-combobox__spinner" aria-hidden="true" /> : null}
      </label>

      <ul className="location-picker__city-list" aria-live="polite" aria-busy={isSearching}>
        {filtered.length === 0 ? (
          <li className="location-picker__empty">
            <Icon name="search" width="21" height="21" />
            <span>{labels.noCityMatches}</span>
          </li>
        ) : (
          filtered.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                onClick={() => choose(city)}
                disabled={isPending || !city.isLaunched}
                className={[
                  city.id === currentCityId ? 'is-selected' : '',
                  !city.isLaunched ? 'is-upcoming' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={`${city.name}, ${city.stateName} — ${
                  city.id === currentCityId
                    ? labels.selected
                    : city.isLaunched
                      ? labels.liveNow
                      : labels.comingSoon
                }`}
              >
                <span className="location-picker__city-avatar" aria-hidden="true">
                  {city.name.slice(0, 1)}
                </span>
                <span className="location-picker__city-copy">
                  <strong>{city.name}</strong>
                  <small>{city.stateName}</small>
                </span>
                <span className={`location-picker__city-state${city.isLaunched ? ' is-live' : ''}`}>
                  {city.id === currentCityId ? (
                    <>
                      <Icon name="check" width="11" height="11" /> {labels.selected}
                    </>
                  ) : city.isLaunched ? (
                    labels.liveNow
                  ) : (
                    labels.comingSoon
                  )}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
