import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

/**
 * App modal built on Radix Dialog.
 *
 * Content is portalled to `document.body` with overlay/content at z-[70/71],
 * above toasts (`z-50`) and the history context menu, and immune to the
 * `transform` animations on `PageContainer`/`.stagger-in` that used to turn
 * those ancestors into the containing block for `position: fixed` (modal
 * opening behind the cards and offset from the viewport). Radix provides
 * focus trapping, Escape-to-close and outside-click handling.
 */
export function Modal({ isOpen, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const { t } = useTranslation("common");

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

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
            "fixed left-1/2 top-1/2 z-[71] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "rounded-lg border border-border-default bg-bg-elevated shadow-level-4 animate-scale-in",
            "focus:outline-none",
            sizes[size]
          )}
        >
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
              <div>
                {title && (
                  <Dialog.Title className="text-[15px] font-semibold text-text-primary">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Button variant="icon" size="sm" onClick={onClose} aria-label={t("accessibility.close")}>
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
          {/* Keep a Title for screen readers even when no visible header. */}
          {!title && !description && (
            <Dialog.Title className="sr-only">{t("accessibility.dialog")}</Dialog.Title>
          )}
          {children ? <div className="px-5 py-4">{children}</div> : null}
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
