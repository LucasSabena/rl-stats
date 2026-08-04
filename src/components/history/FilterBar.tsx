import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { MatchFilters, MatchType } from "@/lib/types";
import { formatLocalDateFromUnix, parseLocalDateToUnix } from "@/lib/utils";
import { Search, X, SlidersHorizontal } from "lucide-react";

interface FilterBarProps {
  filters: MatchFilters;
  onChange: (filters: MatchFilters) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const { t } = useTranslation(["history", "common"]);
  const filtersRef = useRef(filters);

  const resultOptions = [
    { value: "all", label: t("history:filters.results.all") },
    { value: "win", label: t("history:filters.results.wins") },
    { value: "loss", label: t("history:filters.results.losses") },
  ];

  const matchTypeOptions = [
    { value: "all", label: t("history:filters.matchTypes.all") },
    { value: "ranked", label: t("history:matchTypes.ranked") },
    { value: "casual", label: t("history:matchTypes.casual") },
    { value: "tournament", label: t("history:matchTypes.tournament") },
    { value: "other", label: t("history:matchTypes.other") },
  ];

  const modeOptions = [
    { value: "all", label: t("history:filters.modes.all") },
    { value: "Duel", label: t("history:playlists.duel") },
    { value: "Doubles", label: t("history:playlists.doubles") },
    { value: "Standard", label: t("history:playlists.standard") },
    { value: "Chaos", label: t("history:playlists.chaos") },
    { value: "Other", label: t("history:playlists.other") },
  ];

  const dateInputClasses = cn(
    "h-9 rounded-md border bg-bg-surface px-3 text-sm text-text-primary",
    "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50",
    "[color-scheme:dark]"
  );

  const [search, setSearch] = useState(filters.search ?? "");

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    setSearch(filters.search ?? "");
  }, [filters.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const currentFilters = filtersRef.current;
      if (search !== (currentFilters.search ?? "")) {
        onChange({ ...currentFilters, search: search || undefined });
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [onChange, search]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
    },
    []
  );

  const handleResult = useCallback(
    (value: string) => {
      const currentFilters = filtersRef.current;
      onChange({
        ...currentFilters,
        result: value === "all" ? null : (value as "win" | "loss"),
      });
    },
    [onChange]
  );

  const handleMatchType = useCallback(
    (value: string) => {
      const currentFilters = filtersRef.current;
      onChange({
        ...currentFilters,
        matchType: value === "all" ? null : (value as MatchType),
      });
    },
    [onChange]
  );

  const handleMode = useCallback(
    (value: string) => {
      const currentFilters = filtersRef.current;
      onChange({
        ...currentFilters,
        mode: value === "all" ? null : value,
      });
    },
    [onChange]
  );

  const handleDateFrom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const timestamp = value ? parseLocalDateToUnix(value) : null;
      onChange({ ...filtersRef.current, dateFrom: timestamp });
    },
    [onChange]
  );

  const handleDateTo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const timestamp = value ? parseLocalDateToUnix(value, true) : null;
      onChange({ ...filtersRef.current, dateTo: timestamp });
    },
    [onChange]
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    onChange({});
  }, [onChange]);

  const hasFilters =
    filters.result ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.matchType ||
    filters.mode;

  const dateFromValue = filters.dateFrom
    ? formatLocalDateFromUnix(filters.dateFrom)
    : "";

  const dateToValue = filters.dateTo
    ? formatLocalDateFromUnix(filters.dateTo)
    : "";

  return (
    <div className="mt-6 rounded-xl border border-border-subtle bg-bg-panel/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal size={16} className="text-text-muted" />
        <span className="text-xs font-semibold text-text-muted">
          {t("history:filters.title")}
        </span>
        {hasFilters && (
          <span className="ml-auto">
            <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={X}>
              {t("history:filters.clear")}
            </Button>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">{t("history:filters.search.label")}</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("history:filters.search.placeholder")}
              className={cn(
                "h-9 w-48 rounded-md border bg-bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted",
                "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
              )}
            />
          </div>
        </div>

        {/* Resultado */}
        <Select
          options={resultOptions}
          value={filters.result ?? "all"}
          onChange={handleResult}
          placeholder={t("history:filters.results.placeholder")}
        />

        {/* Tipo */}
        <Select
          options={matchTypeOptions}
          value={filters.matchType ?? "all"}
          onChange={handleMatchType}
          placeholder={t("history:filters.matchTypes.placeholder")}
        />

        {/* Modo */}
        <Select
          options={modeOptions}
          value={filters.mode ?? "all"}
          onChange={handleMode}
          placeholder={t("history:filters.modes.placeholder")}
        />

        {/* Date range */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">{t("history:filters.dateFrom")}</label>
          <input
            type="date"
            value={dateFromValue}
            onChange={handleDateFrom}
            className={dateInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">{t("history:filters.dateTo")}</label>
          <input
            type="date"
            value={dateToValue}
            onChange={handleDateTo}
            className={dateInputClasses}
          />
        </div>
      </div>
    </div>
  );
}
