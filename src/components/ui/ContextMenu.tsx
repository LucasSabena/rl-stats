import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Right-click menu built on Radix ContextMenu.
 *
 * The menu content is portalled to `document.body`, so it is never trapped
 * inside a transformed ancestor (e.g. `.stagger-in` cards or
 * `PageContainer`'s slide-in animation, which used to make `position: fixed`
 * resolve against the card instead of the viewport and paint behind siblings).
 * Radix positions the menu next to the pointer with viewport collision
 * handling, replacing the previous manual clientX/clientY clamp.
 */
export function ContextMenu({ children, items, onOpenChange, className, style }: ContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>
        <div className={cn("w-full", className)} style={style}>
          {children}
        </div>
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          collisionPadding={8}
          className={cn(
            "z-[70] min-w-[11rem] overflow-hidden rounded-xl border border-border-highlight bg-bg-elevated py-1.5 shadow-level-3",
            "animate-scale-in",
            "data-[state=open]:animate-scale-in"
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <ContextMenuPrimitive.Item
                key={index}
                onSelect={() => item.onClick()}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-text-primary outline-none transition-colors",
                  "hover:bg-surface-hover focus-visible:bg-surface-hover",
                  "data-[highlighted]:bg-surface-hover",
                  item.variant === "danger" && "text-accent-danger hover:bg-accent-danger-subtle focus-visible:bg-accent-danger-subtle data-[highlighted]:bg-accent-danger-subtle"
                )}
              >
                {Icon && <Icon size={15} aria-hidden="true" />}
                <span>{item.label}</span>
              </ContextMenuPrimitive.Item>
            );
          })}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
