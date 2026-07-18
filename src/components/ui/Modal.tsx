import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Modal({ isOpen, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const { t } = useTranslation("common");
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !contentRef.current) return;

      const focusable = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        e.preventDefault();
        contentRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    if (isOpen) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener("keydown", handleKeyDown);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      contentRef.current?.focus();
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousOverflow;
        previousFocusRef.current?.focus();
      };
    }
    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "var(--color-overlay)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "w-full rounded-xl border border-border-highlight bg-bg-surface shadow-level-4 animate-scale-in",
          sizes[size]
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border-subtle px-6 py-5">
            <div>
              {title && <h2 id={titleId} className="font-display text-lg font-semibold text-text-primary">{title}</h2>}
              {description && <p id={descriptionId} className="mt-1 text-sm text-text-secondary">{description}</p>}
            </div>
            <Button variant="icon" onClick={onClose} aria-label={t("accessibility.close")}>
              <X size={18} />
            </Button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="border-t border-border-subtle px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
