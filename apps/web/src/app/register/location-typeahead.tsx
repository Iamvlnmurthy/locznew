'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { searchLocationUnifiedAction, type LocationSuggestion } from '@/app/actions';

export function LocationTypeahead({
  defaultCityId = '',
  defaultPincode = '',
  defaultLabel = '',
}: {
  defaultCityId?: string;
  defaultPincode?: string;
  defaultLabel?: string;
}) {
  const [query, setQuery] = useState(defaultLabel);
  const [selectedCityId, setSelectedCityId] = useState(defaultCityId);
  const [selectedPincode, setSelectedPincode] = useState(defaultPincode);
  const [selectedLabel, setSelectedLabel] = useState(defaultLabel);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term || term === selectedLabel) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const results = await searchLocationUnifiedAction(term);
        if (active) {
          setSuggestions(results);
          setIsOpen(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, selectedLabel]);

  function handleSelect(item: LocationSuggestion) {
    setQuery(item.label);
    setSelectedLabel(item.label);
    setSelectedCityId(item.cityId ?? '');
    setSelectedPincode(item.pincode ?? '');
    setIsOpen(false);
    setSuggestions([]);
  }

  function handleClear() {
    setQuery('');
    setSelectedLabel('');
    setSelectedCityId('');
    setSelectedPincode('');
    setSuggestions([]);
    setIsOpen(false);
  }

  return (
    <div className="location-typeahead">
      <input type="hidden" name="cityId" value={selectedCityId} />
      <input type="hidden" name="pincode" value={selectedPincode} />

      <div className="location-typeahead__input-wrap">
        <span className="location-typeahead__icon">
          <Icon name="location" />
        </span>
        <input
          id="register-location"
          type="text"
          autoComplete="off"
          placeholder="Enter city, area or PIN code (e.g. Hyderabad, 500081)"
          value={query}
          required={!selectedCityId && !selectedPincode}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedCityId || selectedPincode) {
              setSelectedCityId('');
              setSelectedPincode('');
              setSelectedLabel('');
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 200);
          }}
        />
        {loading ? (
          <span className="location-typeahead__spinner">
            <Icon name="sparkles" />
          </span>
        ) : query ? (
          <button
            type="button"
            className="location-typeahead__clear"
            onClick={handleClear}
            aria-label="Clear location"
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen && suggestions.length > 0 ? (
        <ul className="location-typeahead__dropdown">
          {suggestions.map((item) => (
            <li
              key={`${item.type}-${item.id}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
            >
              <span className={`location-typeahead__tag is-${item.type}`}>
                {item.type === 'city' ? 'City' : 'Area'}
              </span>
              <div className="location-typeahead__details">
                <strong>{item.label}</strong>
                {item.sublabel ? <small>{item.sublabel}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedLabel ? (
        <div className="location-typeahead__selected">
          <Icon name="check" /> Selected: <strong>{selectedLabel}</strong>
        </div>
      ) : null}
    </div>
  );
}
