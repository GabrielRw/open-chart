"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CityResult } from "@/lib/types/astro";

interface CityAutocompleteProps {
  selectedCity: CityResult | null;
  onSelect: (city: CityResult) => void;
  onClear: () => void;
}

export function CityAutocomplete({
  selectedCity,
  onSelect,
  onClear,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (selectedCity) {
      skipNextSearchRef.current = true;
      setQuery(`${selectedCity.name}, ${selectedCity.country_code}`);
    }
  }, [selectedCity]);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/geo/search?q=${encodeURIComponent(query.trim())}&limit=8`,
        );
        const body = (await response.json()) as
          | { results: CityResult[] }
          | { error?: { message?: string } };

        if (!response.ok || !("results" in body)) {
          setError(
            "error" in body && body.error?.message
              ? body.error.message
              : "Could not load cities.",
          );
          setResults([]);
          setOpen(true);
          return;
        }

        setResults(body.results);
        setOpen(true);
      } catch {
        setError("Network error while searching cities.");
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const empty = useMemo(() => !loading && open && !error && results.length === 0, [
    loading,
    open,
    error,
    results.length,
  ]);

  return (
    <div className="relative">
      <label htmlFor="city-search" className="mb-1 block text-sm font-medium">
        City
      </label>
      <input
        id="city-search"
        type="text"
        value={query}
        placeholder="Start typing a city"
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(next.trim().length >= 2);

          if (selectedCity) {
            onClear();
          }
        }}
        className="w-full border border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />

      {open ? (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto border border-black bg-white">
          {loading ? <p className="px-3 py-2 text-sm">Searching...</p> : null}
          {error ? <p className="px-3 py-2 text-sm">{error}</p> : null}
          {empty ? <p className="px-3 py-2 text-sm">No cities found.</p> : null}
          {!loading && !error
            ? results.map((city) => (
                <button
                  key={`${city.name}-${city.country_code}-${city.lat}-${city.lng}`}
                  type="button"
                  onClick={() => {
                    skipNextSearchRef.current = true;
                    onSelect(city);
                    setQuery(`${city.name}, ${city.country_code}`);
                    setOpen(false);
                  }}
                  className="block w-full border-b border-black/10 px-3 py-2 text-left text-sm hover:bg-black hover:text-white"
                >
                  <span className="font-medium">{city.name}</span>
                  <span className="ml-1 text-xs">({city.country_code})</span>
                  <span className="ml-2 text-xs">{city.timezone}</span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
