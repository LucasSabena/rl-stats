import { cloneElement, isValidElement, useId, useState } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ content, children, position = "top", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const trigger = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, {
        "aria-describedby": visible
          ? [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
          : children.props["aria-describedby"],
      })
    : children;

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setVisible(false);
      }}
    >
      {trigger}
      {visible && (
        <div
          id={tooltipId}
          className={cn(
            "pointer-events-none absolute z-30 whitespace-nowrap rounded-lg border border-border-highlight bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-level-2 animate-fade-in",
            positions[position]
          )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
