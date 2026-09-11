import { useId } from "react";
import { cn } from "@/lib/utils";

export type SwitchSize = "sm" | "md";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  size?: SwitchSize;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

const TRACK_SIZES: Record<SwitchSize, string> = {
  sm: "h-5 w-9",
  md: "h-6 w-11",
};

const THUMB_SIZES: Record<SwitchSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

const THUMB_POSITIONS: Record<SwitchSize, { on: string; off: string }> = {
  sm: { on: "translate-x-[19px]", off: "translate-x-[3px]" },
  md: { on: "translate-x-6", off: "translate-x-1" },
};

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  id,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;

  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          toggle();
        }
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        "disabled:pointer-events-none disabled:opacity-45",
        TRACK_SIZES[size],
        checked ? "bg-accent-primary" : "bg-border-highlight",
        !label && !description && className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block transform rounded-full bg-white shadow-sm transition-transform duration-200",
          THUMB_SIZES[size],
          checked ? THUMB_POSITIONS[size].on : THUMB_POSITIONS[size].off,
        )}
      />
    </button>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <label
        htmlFor={switchId}
        className={cn(
          "select-none",
          disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        )}
      >
        {label && (
          <span className="block text-sm font-medium text-text-secondary">{label}</span>
        )}
        {description && (
          <span className="block text-xs text-text-muted">{description}</span>
        )}
      </label>
      {control}
    </div>
  );
}
