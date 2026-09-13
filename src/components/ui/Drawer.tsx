import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "./Button";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left";
  className?: string;
}

/**
 * Side sheet built on Radix Dialog. Same focus trapping, Escape-to-close and
 * outside-click semantics as `Modal`, but anchored to the viewport edge —
 * used for detail panels and the notification center.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  className,
}: DrawerProps) {
  const { t } = useTranslation("common");

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[70] animate-fade-in"
          style={{ background: "var(--color-overlay)" }}
        />
        <Dialog.Content
          className={cn(
            "fixed top-0 z-[71] flex h-full w-[min(420px,100vw)] flex-col border-border-subtle bg-bg-elevated shadow-level-4 animate-fade-in",
            side === "right"
              ? "right-0 border-l animate-drawer-in-right"
              : "left-0 border-r animate-drawer-in-left",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
            <div className="min-w-0">
              {title && (
                <Dialog.Title className="truncate text-[15px] font-semibold text-text-primary">
                  {title}
                </Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-1 text-[13px] text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Button
              variant="icon"
              size="sm"
              onClick={onClose}
              aria-label={t("accessibility.close")}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
          {!title && !description && (
            <Dialog.Title className="sr-only">{t("accessibility.dialog")}</Dialog.Title>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
