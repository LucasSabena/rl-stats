import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Moon, Sun, Bell } from "lucide-react";
import { useLiveStore } from "@/stores/liveStore";
import { useUIStore } from "@/stores/uiStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { useActiveProfile, useProfiles, useProfileMutations } from "@/hooks/useProfiles";
import { restartApp } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  CreateProfileModal,
  SwitchProfileModal,
} from "@/components/settings/ProfileModals";

const TITLE_KEYS: Record<string, string> = {
  "/": "pageTitles.live",
  "/history": "pageTitles.history",
  "/analytics": "pageTitles.analytics",
  "/sessions": "pageTitles.sessions",
  "/records": "pageTitles.records",
  "/players": "pageTitles.players",
  "/pro-configs": "pageTitles.proConfigs",
  "/training-packs": "pageTitles.trainingPacks",
  "/profile": "pageTitles.profile",
  "/settings": "pageTitles.settings",
};

function resolveTitleKey(pathname: string): string {
  if (TITLE_KEYS[pathname]) return TITLE_KEYS[pathname];
  if (pathname.startsWith("/history/")) return "pageTitles.matchDetail";
  if (pathname.startsWith("/sessions/")) return "pageTitles.sessions";
  if (pathname.startsWith("/players/")) return "pageTitles.players";
  return "pageTitles.fallback";
}

export function Header() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  // Derive the boolean in the selector: currentMatch is a new object at 20 Hz
  // during a match, and subscribing to it re-rendered the whole header.
  const isLive = useLiveStore(
    (state) => state.connectionStatus === "connected" && state.currentMatch !== null,
  );

  const profilesQuery = useProfiles();
  const activeProfileQuery = useActiveProfile();
  const {
    createProfile: createProfileMutation,
    switchProfile: switchProfileMutation,
  } = useProfileMutations();

  const profiles = profilesQuery.data ?? [];
  const activeProfile = activeProfileQuery.data ?? null;
  const isLoading =
    profilesQuery.isLoading ||
    activeProfileQuery.isLoading ||
    createProfileMutation.isPending ||
    switchProfileMutation.isPending;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const unreadNotifications = useNotificationStore(
    (state) => state.items.filter((item) => !item.read).length
  );

  const profileOptions = profiles.map((p) => ({ value: p.id, label: p.name }));

  // One connection indicator, not two. Previously the header showed both a
  // "waiting for game" badge and a separate ONLINE/OFFLINE pill saying the
  // same thing.
  const connection = isLive
    ? { dot: "bg-accent-success", label: t("status.live") }
    : connectionStatus === "connected"
      ? { dot: "bg-accent-success", label: t("connection.waitingForGame") }
      : connectionStatus === "connecting"
        ? { dot: "bg-accent-warning animate-pulse", label: t("connection.connecting") }
        : { dot: "bg-text-tertiary", label: t("connection.offline") };

  const handleSwitchProfile = (id: string) => {
    if (id === activeProfile?.id) return;
    setPendingSwitchId(id);
    setIsSwitchOpen(true);
  };

  const handleSwitchConfirm = async () => {
    if (!pendingSwitchId) return;
    try {
      await switchProfileMutation.mutateAsync(pendingSwitchId);
      setIsSwitchOpen(false);
      await restartApp();
    } catch {
      // The modal stays open so the error is visible
    }
  };

  const handleCreateConfirm = async (name: string, playerName: string) => {
    if (!name.trim()) return;
    try {
      const created = await createProfileMutation.mutateAsync({
        name: name.trim(),
        playerName: playerName.trim(),
      });
      await switchProfileMutation.mutateAsync(created.id);
      setIsCreateOpen(false);
      await restartApp();
    } catch {
      // The modal stays open so the error is visible
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-bg-base px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
            {t(resolveTitleKey(location.pathname))}
          </h1>

          <span
            data-tour="connection"
            className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"
          >
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", connection.dot)}
            />
            {connection.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5" data-tour="profiles">
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            aria-label={t("notifications.title")}
            title={t("notifications.title")}
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Bell size={15} aria-hidden="true" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-[9px] font-bold text-accent-primary-fg">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </button>
          <Button
            variant="icon"
            size="sm"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? t("theme.switchToLight")
                : t("theme.switchToDark")
            }
            title={theme === "dark" ? t("theme.light") : t("theme.dark")}
          >
            {theme === "dark" ? (
              <Sun size={15} aria-hidden="true" />
            ) : (
              <Moon size={15} aria-hidden="true" />
            )}
          </Button>
          <Select
            options={profileOptions}
            value={activeProfile?.id ?? ""}
            onChange={handleSwitchProfile}
            placeholder={t("profile.selectPlaceholder")}
            size="sm"
            align="right"
          />
          <Button
            variant="icon"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            aria-label={t("profile.new")}
            title={t("profile.new")}
          >
            <Plus size={15} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
      <CreateProfileModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onConfirm={handleCreateConfirm}
        isLoading={isLoading}
      />
      <SwitchProfileModal
        isOpen={isSwitchOpen}
        onClose={() => {
          setIsSwitchOpen(false);
          setPendingSwitchId(null);
        }}
        onConfirm={handleSwitchConfirm}
        profileName={profiles.find((p) => p.id === pendingSwitchId)?.name ?? ""}
        isLoading={isLoading}
      />
    </>
  );
}
