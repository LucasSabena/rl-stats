import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  className?: string;
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Enables the leading checkbox column and select-all control. */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  onRowClick?: (row: T) => void;
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate && !checked);
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="h-3.5 w-3.5 accent-[var(--accent)]"
    />
  );
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  className,
  emptyMessage,
  rowClassName,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  onRowClick,
}: DataTableProps<T>) {
  const { t } = useTranslation("common");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const selected = selectedKeys ?? new Set<string>();
  const allSelected = data.length > 0 && data.every((row) => selected.has(keyExtractor(row)));
  const someSelected = !allSelected && data.some((row) => selected.has(keyExtractor(row)));

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, sortKey, sortDir, columns]);

  function handleSort(key: string, sortable?: boolean) {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleToggleAll(next: boolean) {
    if (!onSelectionChange) return;
    if (next) {
      onSelectionChange(new Set(data.map(keyExtractor)));
    } else {
      onSelectionChange(new Set());
    }
  }

  function handleToggleRow(row: T, next: boolean) {
    if (!onSelectionChange) return;
    const key = keyExtractor(row);
    const copy = new Set(selected);
    if (next) copy.add(key);
    else copy.delete(key);
    onSelectionChange(copy);
  }

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border-default text-sm text-text-secondary">
        {emptyMessage ?? t("dataTable.noData")}
      </div>
    );
  }

  const columnCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border-subtle", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-surface">
            {selectable && (
              <th scope="col" className="w-10 px-3 py-3">
                <IndeterminateCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleToggleAll}
                  label={t("dataTable.selectAll")}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable
                    ? sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
                tabIndex={col.sortable ? 0 : undefined}
                onKeyDown={
                  col.sortable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSort(col.key, col.sortable);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "px-4 py-3 text-left text-[11px] font-semibold text-text-tertiary",
                  col.sortable &&
                    "cursor-pointer select-none hover:text-text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]",
                  col.className
                )}
                onClick={() => handleSort(col.key, col.sortable)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-accent-primary">
                      {sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => {
            const key = keyExtractor(row);
            const isSelected = selected.has(key);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border-subtle/50 transition-colors hover:bg-surface-hover/50",
                  onRowClick && "cursor-pointer",
                  isSelected && "bg-accent-primary-muted/30",
                  rowClassName?.(row)
                )}
              >
                {selectable && (
                  <td className="w-10 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                    <IndeterminateCheckbox
                      checked={isSelected}
                      onChange={(next) => handleToggleRow(row, next)}
                      label={t("dataTable.selectRow")}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-text-primary", col.className)}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {selectable && (
          <tfoot className="sr-only">
            <tr>
              <td colSpan={columnCount}>
                {t("dataTable.selectedCount", { count: selected.size })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
