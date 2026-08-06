import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { MatchFilters, MatchType } from "@/lib/types";
import { formatLocalDateFromUnix, parseLocalDateToUnix } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  filters: MatchFilters;
  onChange: (filters: MatchFilters) => void;
}

const controlClasses = cn(
  "h-8 rounded-md border border-border-subtle bg-transparent px-2.5 text-xs text-text-primary",
  "transition-colors hover:border-border-default focus:border-accent-primary focus:outline-none",
);

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

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

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
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("history:filters.search.placeholder")}
          aria-label={t("history:filters.search.label")}
          className={cn(controlClasses, "w-44 pl-8 placeholder:text-text-muted")}
        />
      </div>

      <Select
        options={resultOptions}
        value={filters.result ?? "all"}
        onChange={handleResult}
        placeholder={t("history:filters.results.placeholder")}
        aria-label={t("history:filters.results.placeholder")}
        size="sm"
      />

      <Select
        options={matchTypeOptions}
        value={filters.matchType ?? "all"}
        onChange={handleMatchType}
        placeholder={t("history:filters.matchTypes.placeholder")}
        aria-label={t("history:filters.matchTypes.placeholder")}
        size="sm"
      />

      <Select
        options={modeOptions}
        value={filters.mode ?? "all"}
        onChange={handleMode}
        placeholder={t("history:filters.modes.placeholder")}
        aria-label={t("history:filters.modes.placeholder")}
        size="sm"
      />

      <input
        type="date"
        value={dateFromValue}
        onChange={handleDateFrom}
        aria-label={t("history:filters.dateFrom")}
        className={controlClasses}
      />

      <input
        type="date"
        value={dateToValue}
        onChange={handleDateTo}
        aria-label={t("history:filters.dateTo")}
        className={controlClasses}
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={X}>
          {t("history:filters.clear")}
        </Button>
      )}
    </div>
  );
}
