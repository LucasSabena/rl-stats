import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: "border-accent-success/30 bg-accent-success-subtle text-accent-success",
  error: "border-accent-danger/30 bg-accent-danger-subtle text-accent-danger",
  warning: "border-accent-warning/30 bg-accent-warning-subtle text-accent-warning",
  info: "border-accent-info/30 bg-accent-info-subtle text-accent-info",
};

export function ToastContainer() {
  const toasts = useUIStore((state) => state.toastQueue);
  const removeToast = useUIStore((state) => state.removeToast);

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-3" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: {
    id: string;
    type: "success" | "error" | "warning" | "info";
    title: string;
    message?: string;
    duration?: number;
    action?: { label: string; onClick: () => void };
  };
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const { t } = useTranslation("common");
  const duration = toast.duration ?? (toast.action ? 8000 : 4000);
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const Icon = icons[toast.type];

  return (
    <div
      className={cn(
        "flex w-80 items-start gap-3 rounded-xl border p-4 shadow-level-3 animate-slide-in-right",
        styles[toast.type]
      )}
      role={toast.type === "error" ? "alert" : undefined}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
        {toast.message && <p className="mt-1 text-xs text-text-secondary">{toast.message}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onClose();
            }}
            className="mt-2 rounded-md border border-current/30 px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-current/10"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        aria-label={t("accessibility.close")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
