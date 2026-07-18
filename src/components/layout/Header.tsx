import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveStore } from "@/stores/liveStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Radio, Sparkles, User } from "lucide-react";
import {
  CreateProfileModal,
  SwitchProfileModal,
} from "@/components/settings/ProfileModals";

export function Header() {
  const { t } = useTranslation("common");
  const location = useLocation();

  const pageTitles: Record<string, string> = {
    "/": t("pageTitles.live"),
    "/history": t("pageTitles.history"),
    "/analytics": t("pageTitles.analytics"),
    "/pro-configs": t("pageTitles.proConfigs"),
    "/settings": t("pageTitles.settings"),
  };

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
  const title = pageTitles[location.pathname] || t("pageTitles.fallback");

  const profileOptions = profiles.map((p) => ({ value: p.id, label: p.name }));

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
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-highlight/50 surface-glass px-8 z-20 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent-primary opacity-80" />
            <h1 className="font-display text-lg font-bold tracking-tight text-text-primary text-shadow-sm">
              {title}
            </h1>
          </div>

          <div className="h-4 w-[1px] bg-border-highlight/50 mx-2" />

          {isLive ? (
            <Badge variant="live">
              {t("status.live")}
            </Badge>
          ) : (
            <Badge variant="default" className="opacity-80">
              <Radio size={10} className="mr-1.5" />
              {t("connection.waitingForGame")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Profile selector */}
          <div className="flex items-center gap-2 mr-2" data-tour="profiles">
            <User size={14} className="text-text-secondary shrink-0" />
            <Select
              options={profileOptions}
              value={activeProfile?.id ?? ""}
              onChange={handleSwitchProfile}
              placeholder={t("profile.selectPlaceholder")}
              size="sm"
              align="right"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
            >
              {t("profile.new")}
            </Button>
          </div>

          {/* Connection status indicator dot */}
          <div className="flex items-center gap-2 mr-4 bg-bg-panel/50 px-3 py-1.5 rounded-full border border-border-subtle shadow-[var(--shadow-card-inner)]" data-tour="connection">
            <div className={cn(
              "h-2 w-2 rounded-full",
              connectionStatus === "connected" ? "bg-accent-success shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
              connectionStatus === "connecting" ? "bg-accent-warning animate-pulse" :
              "bg-accent-danger"
            )} />
            <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">
              {connectionStatus === "connected" ? t("connection.online") : connectionStatus === "connecting" ? t("connection.connecting") : t("connection.offline")}
            </span>
          </div>
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
