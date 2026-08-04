import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useLiveStore } from "@/stores/liveStore";
import { useProfileStore } from "@/stores/profileStore";
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
  "/players": "pageTitles.players",
  "/pro-configs": "pageTitles.proConfigs",
  "/training-packs": "pageTitles.trainingPacks",
  "/profile": "pageTitles.profile",
  "/settings": "pageTitles.settings",
};

function resolveTitleKey(pathname: string): string {
  if (TITLE_KEYS[pathname]) return TITLE_KEYS[pathname];
  if (pathname.startsWith("/history/")) return "pageTitles.matchDetail";
  if (pathname.startsWith("/players/")) return "pageTitles.players";
  return "pageTitles.fallback";
}

export function Header() {
  const { t } = useTranslation("common");
  const location = useLocation();

  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  const currentMatch = useLiveStore((state) => state.currentMatch);

  const profiles = useProfileStore((state) => state.profiles);
  const activeProfile = useProfileStore((state) => state.activeProfile);
  const isLoading = useProfileStore((state) => state.isLoading);
  const fetchProfiles = useProfileStore((state) => state.fetchProfiles);
  const createProfile = useProfileStore((state) => state.createProfile);
  const switchProfile = useProfileStore((state) => state.switchProfile);
  const restartApp = useProfileStore((state) => state.restartApp);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const isLive = connectionStatus === "connected" && currentMatch !== null;
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
      await switchProfile(pendingSwitchId);
      setIsSwitchOpen(false);
      await restartApp();
    } catch {
      // Error is already handled in the store
    }
  };

  const handleCreateConfirm = async (name: string, playerName: string) => {
    if (!name.trim()) return;
    try {
      await createProfile(name.trim(), playerName.trim());
      const created = useProfileStore.getState().activeProfile;
      if (created) {
        await switchProfile(created.id);
      }
      setIsCreateOpen(false);
      await restartApp();
    } catch {
      // Error is already handled in the store
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
