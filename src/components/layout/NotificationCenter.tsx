import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useNotificationStore, type NotificationType } from "@/stores/notificationStore";
import { cn } from "@/lib/utils";
import { Bell, CheckCircle, Info, AlertTriangle, Trophy, Check, X } from "lucide-react";

const ICONS: Record<NotificationType, typeof Bell> = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  achievement: Trophy,
};

const ICON_STYLES: Record<NotificationType, string> = {
  success: "text-accent-success",
  info: "text-accent-info",
  warning: "text-accent-warning",
  achievement: "text-accent-secondary",
};

function relativeTime(createdAt: number, locale: string): string {
  const diffMs = Date.now() - createdAt;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  if (minutes < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-hours, "hour");
  const days = Math.round(hours / 24);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const items = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);
  const remove = useNotificationStore((s) => s.remove);

  const unread = items.filter((item) => !item.read).length;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("notifications.title")}
      description={unread > 0 ? `${unread} ${t("notifications.unread")}` : undefined}
      footer={
        items.length > 0 ? (
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" size="sm" onClick={clear}>
              {t("notifications.clear")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Check}
              onClick={markAllRead}
              disabled={unread === 0}
            >
              {t("notifications.markAllRead")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.empty")} />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = ICONS[item.type];
            return (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    markRead(item.id);
                    if (item.href) {
                      navigate(item.href);
                      onClose();
                    }
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 pr-9 text-left transition-colors",
                    item.read
                      ? "border-border-subtle bg-bg-panel/60 hover:bg-bg-hover"
                      : "border-accent-primary/25 bg-accent-primary-muted/40 hover:bg-accent-primary-muted/60"
                  )}
                >
                  <Icon size={16} className={cn("mt-0.5 shrink-0", ICON_STYLES[item.type])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-text-primary">
                        {item.title}
                      </span>
                      {!item.read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" />
                      )}
                    </span>
                    {item.message && (
                      <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                        {item.message}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] text-text-tertiary">
                      {relativeTime(item.createdAt, i18n.language)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("accessibility.close")}
                  onClick={() => remove(item.id)}
                  className="absolute right-2 top-2 rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
