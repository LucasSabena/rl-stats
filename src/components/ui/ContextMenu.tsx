import { useState, useEffect, useCallback } from "react";
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

const MENU_WIDTH = 180;
const MENU_HEIGHT = 130;

export function ContextMenu({ children, items, onOpenChange, className, style }: ContextMenuProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const open = useCallback(
    (x: number, y: number) => {
      const clampedX = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
      const clampedY = Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));
      setPos({ x: clampedX, y: clampedY });
      setVisible(true);
      onOpenChange?.(true);
    },
    [onOpenChange]
  );

  const close = useCallback(() => {
    setVisible(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!visible) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-context-menu]")) {
        close();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, close]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    open(e.clientX, e.clientY);
  }

  return (
    <div onContextMenu={handleContextMenu} className={cn("w-full", className)} style={style}>
      {children}
      {visible && (
        <div
          data-context-menu
          style={{ left: pos.x, top: pos.y }}
          className={cn(
            "fixed z-50 min-w-[10rem] overflow-hidden rounded-xl border border-border-highlight bg-bg-elevated py-1.5 shadow-level-3 animate-scale-in"
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  item.onClick();
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover",
                  item.variant === "danger" && "text-accent-danger hover:bg-accent-danger-subtle"
                )}
              >
                {Icon && <Icon size={15} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
