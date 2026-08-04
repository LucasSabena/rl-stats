import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  size?: "sm" | "md";
  icon?: ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  className,
  align = "left",
  placement = "bottom",
  size = "md",
  icon,
  disabled,
  "aria-label": ariaLabel,
}: SelectProps) {
  const { t } = useTranslation("common");
  const resolvedPlaceholder = placeholder ?? t("select.placeholder");

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  // Keep the highlighted option in view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const options =
      listRef.current?.querySelectorAll<HTMLElement>("[role='option']");
    options?.[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Tab":
        close();
        break;
    }
  };

  const height = size === "sm" ? "h-8" : "h-9";
  const textSize = size === "sm" ? "text-[13px]" : "text-sm";

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className={cn(
          height,
          textSize,
          "flex w-full items-center gap-2 rounded-md border border-border-default bg-bg-surface px-2.5",
          "text-text-primary transition-colors duration-150",
          "hover:border-border-highlight",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          open && "border-border-highlight",
          disabled && "cursor-not-allowed opacity-45 hover:border-border-default",
        )}
      >
        {icon && <span className="shrink-0 text-text-tertiary">{icon}</span>}
        <span
          className={cn(
            "flex-1 truncate text-left",
            !selectedOption && "text-text-muted",
          )}
        >
          {selectedOption?.label ?? resolvedPlaceholder}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-text-tertiary transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "animate-scale-in absolute z-40 max-h-64 min-w-full overflow-y-auto rounded-md",
            "border border-border-default bg-bg-elevated py-1 shadow-level-3",
            align === "right" ? "right-0" : "left-0",
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-2.5 py-1.5",
                  textSize,
                  isActive && "bg-surface-hover",
                  isSelected ? "text-accent-primary" : "text-text-secondary",
                )}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <Check size={14} aria-hidden="true" className="shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SelectWithLabelProps extends SelectProps {
  label: string;
}

export function SelectWithLabel({ label, ...selectProps }: SelectWithLabelProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <Select {...selectProps} aria-label={selectProps["aria-label"] ?? label} />
    </div>
  );
}
