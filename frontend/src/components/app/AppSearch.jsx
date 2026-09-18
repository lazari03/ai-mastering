"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { IconSearch } from "@/components/app/icons";

// A real, working search over the app's actual destinations (see
// SEARCH_INDEX in AppClient.jsx) — client-side substring match, since
// there's no server-side search endpoint and nothing here needs one: the
// whole index is a handful of static tabs/features. Enter or a click
// navigates immediately; Escape clears and closes the results.
export default function AppSearch({ index, onSelect, className = "" }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const results = query.trim() ? index.filter((item) => t(item.labelKey).toLowerCase().includes(query.trim().toLowerCase())) : [];

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const select = (item) => {
    onSelect(item.goTo);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-black/[0.02] px-3.5 py-2">
        <span className="text-text-secondary">
          <IconSearch width={15} height={15} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) select(results[0]);
            if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
          placeholder={t("app.search.placeholder")}
          className="w-full min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
      </div>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-border-subtle bg-bg shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          {results.length ? (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item)}
                className="block w-full px-3.5 py-2.5 text-left text-sm text-text-primary hover:bg-black/[0.045]"
              >
                {t(item.labelKey)}
              </button>
            ))
          ) : (
            <p className="px-3.5 py-2.5 text-sm text-text-secondary">{t("app.search.noResults")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
