import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { Popover } from "./Popover";

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  align?: "start" | "end";
}

function iso(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function formatRangeLabel(range: DateRange, locale: string): string {
  if (!range.from && !range.to) return "";
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  if (range.from && range.to) {
    if (range.from === range.to) return fmt.format(new Date(range.from));
    return `${fmt.format(new Date(range.from))} – ${fmt.format(new Date(range.to))}`;
  }
  return range.from
    ? `${fmt.format(new Date(range.from))} →`
    : `→ ${fmt.format(new Date(range.to as string))}`;
}

/**
 * Date range with common presets plus free from/to inputs. Values are
 * ISO `YYYY-MM-DD` strings so they can be dropped straight into SQL date
 * comparisons and URL params.
 */
export function DateRangePicker({ value, onChange, className, align = "start" }: DateRangePickerProps) {
  const { t, i18n } = useTranslation("common");

  const presets = useMemo(() => {
    const now = new Date();
    const daysAgo = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return iso(d);
    };
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    return [
      { key: "today", label: t("dateRange.today"), range: { from: iso(now), to: iso(now) } },
      { key: "7d", label: t("dateRange.last7"), range: { from: daysAgo(6), to: iso(now) } },
      { key: "30d", label: t("dateRange.last30"), range: { from: daysAgo(29), to: iso(now) } },
      { key: "month", label: t("dateRange.thisMonth"), range: { from: iso(startOfMonth), to: iso(now) } },
      {
        key: "prevMonth",
        label: t("dateRange.lastMonth"),
        range: { from: iso(startOfPrevMonth), to: iso(endOfPrevMonth) },
      },
    ];
  }, [t]);

  const label = formatRangeLabel(value, i18n.language) || t("dateRange.placeholder");

  return (
    <Popover
      align={align}
      className={cn("w-[280px] p-3", className)}
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-bg-panel px-3 text-xs font-medium transition-colors",
            value.from || value.to
              ? "text-text-primary"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const active =
              value.from === preset.range.from && value.to === preset.range.to;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => onChange(preset.range)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                    : "border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              {t("dateRange.from")}
            </span>
            <input
              type="date"
              value={value.from ?? ""}
              max={value.to ?? undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value || null })}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              {t("dateRange.to")}
            </span>
            <input
              type="date"
              value={value.to ?? ""}
              min={value.from ?? undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value || null })}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => onChange({ from: null, to: null })}
          className="w-full rounded-md border border-border-subtle py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {t("dateRange.clear")}
        </button>
      </div>
    </Popover>
  );
}
