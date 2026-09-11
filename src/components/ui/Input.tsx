import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export type InputSize = "sm" | "md";

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
  size?: InputSize;
  containerClassName?: string;
}

const SIZES: Record<InputSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3 text-sm",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      label,
      error,
      hint,
      size = "md",
      id,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = !error && hint ? `${inputId}-hint` : undefined;
    const describedBy =
      [ariaDescribedBy, errorId, hintId].filter(Boolean).join(" ") || undefined;

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-md border bg-bg-surface text-text-primary transition-colors duration-150",
            "placeholder:text-text-muted",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            "disabled:cursor-not-allowed disabled:opacity-45",
            SIZES[size],
            error
              ? "border-accent-danger"
              : "border-border-default hover:border-border-highlight",
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} className="text-xs text-accent-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
