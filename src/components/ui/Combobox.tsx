import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover } from "./Popover";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  size?: "sm" | "md";
  align?: "start" | "end";
  clearable?: boolean;
}

/**
 * Searchable single-select. Used where the option list is long enough that a
 * plain select becomes unusable (players, arenas, playlists).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  className,
  size = "md",
  align = "start",
  clearable = true,
}: ComboboxProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.hint?.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      align={align}
      className="w-[260px] p-1.5"
      trigger={
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-panel px-3 text-left transition-colors hover:bg-bg-hover focus:border-accent-primary focus:outline-none",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            selected ? "text-text-primary" : "text-text-tertiary",
            className
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder ?? t("combobox.placeholder")}</span>
          <ChevronsUpDown size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-2 pb-1.5">
        <Search size={13} className="text-text-tertiary" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder ?? t("combobox.search")}
          aria-label={searchPlaceholder ?? t("combobox.search")}
          className="h-7 w-full bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
      </div>
      <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
        {clearable && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors",
                value === null
                  ? "bg-accent-primary-muted text-accent-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              {placeholder ?? t("combobox.all")}
              {value === null && <Check size={13} />}
            </button>
          </li>
        )}
        {filtered.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-text-tertiary">
            {emptyMessage ?? t("combobox.empty")}
          </li>
        )}
        {filtered.map((option) => {
          const active = option.value === value;
          return (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-accent-primary-muted text-accent-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {option.label}
                  {option.hint && (
                    <span className="ml-2 text-[10px] text-text-tertiary">{option.hint}</span>
                  )}
                </span>
                {active && <Check size={13} className="shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
