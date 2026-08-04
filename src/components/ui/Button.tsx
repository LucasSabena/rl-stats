import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "icon"
  | "accent";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent-primary text-[var(--accent-fg)] hover:bg-accent-primary-hover",
  // Alias of primary: the old gradient variant read as decoration, not hierarchy.
  accent: "bg-accent-primary text-[var(--accent-fg)] hover:bg-accent-primary-hover",
  secondary:
    "border border-border-default bg-bg-surface text-text-primary hover:bg-surface-hover hover:border-border-highlight",
  danger: "bg-accent-danger text-white hover:brightness-110",
  ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  icon: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-[15px]",
};

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const iconSize = ICON_SIZES[size];

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-md font-medium",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          "disabled:pointer-events-none disabled:opacity-45",
          variant === "icon" ? ICON_ONLY_SIZES[size] : SIZES[size],
          VARIANTS[variant],
          className,
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {!isLoading && LeftIcon && <LeftIcon size={iconSize} aria-hidden="true" />}
        {children}
        {!isLoading && RightIcon && <RightIcon size={iconSize} aria-hidden="true" />}
      </button>
    );
  },
);

Button.displayName = "Button";
