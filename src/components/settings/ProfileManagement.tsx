import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useActiveProfile, useProfiles, useProfileMutations } from "@/hooks/useProfiles";
import { getProfileComparison, restartApp } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { User, Trash2, Edit3, Plus, AlertCircle, Crown } from "lucide-react";
import {
  CreateProfileModal,
  DeleteProfileModal,
  SwitchProfileModal,
  RenameProfileModal,
} from "@/components/settings/ProfileModals";

export function ProfileManagement() {
  const { t } = useTranslation(["profiles", "common"]);
  const profilesQuery = useProfiles();
  const activeProfileQuery = useActiveProfile();
  const {
    createProfile: createProfileMutation,
    switchProfile: switchProfileMutation,
    deleteProfile: deleteProfileMutation,
    renameProfile: renameProfileMutation,
  } = useProfileMutations();

  const profiles = profilesQuery.data ?? [];
  const activeProfile = activeProfileQuery.data ?? null;
  const isLoading =
    profilesQuery.isLoading ||
    activeProfileQuery.isLoading ||
    createProfileMutation.isPending ||
    switchProfileMutation.isPending ||
    deleteProfileMutation.isPending ||
    renameProfileMutation.isPending;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [pendingProfileName, setPendingProfileName] = useState<string>("");
  const [renameCurrentName, setRenameCurrentName] = useState<string>("");
  const [createError, setCreateError] = useState("");
  const [renameError, setRenameError] = useState("");

  const openDelete = (id: string, name: string) => {
    setPendingProfileId(id);
    setPendingProfileName(name);
    setIsDeleteOpen(true);
  };

  const openSwitch = (id: string, name: string) => {
    setPendingProfileId(id);
    setPendingProfileName(name);
    setIsSwitchOpen(true);
  };

  const openRename = (id: string, name: string) => {
    setPendingProfileId(id);
    setRenameCurrentName(name);
    setRenameError("");
    setIsRenameOpen(true);
  };

  const handleCreateConfirm = async (name: string, playerName: string) => {
    const trimmed = name.trim();
    const trimmedPlayerName = playerName.trim();
    if (!trimmed) return;
    if (profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setCreateError(t("profiles:errors.duplicateName"));
      return;
    }
    setCreateError("");
    try {
      const created = await createProfileMutation.mutateAsync({
        name: trimmed,
        playerName: trimmedPlayerName,
      });
      await switchProfileMutation.mutateAsync(created.id);
      setIsCreateOpen(false);
      await restartApp();
    } catch {
      // The modal stays open so the error is visible
    }
  };

  const handleSwitchConfirm = async () => {
    if (!pendingProfileId) return;
    await switchProfileMutation.mutateAsync(pendingProfileId);
    setIsSwitchOpen(false);
    await restartApp();
  };

  const handleDeleteConfirm = async () => {
    if (!pendingProfileId) return;
    if (profiles.length <= 1) {
      setIsDeleteOpen(false);
      return;
    }
    if (activeProfile?.id === pendingProfileId) {
      setIsDeleteOpen(false);
      return;
    }
    await deleteProfileMutation.mutateAsync(pendingProfileId);
    setIsDeleteOpen(false);
  };

  const handleRenameConfirm = async (newName: string) => {
    if (!pendingProfileId) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenameError(t("profiles:errors.emptyName"));
      return;
    }
    if (trimmed === renameCurrentName) {
      setIsRenameOpen(false);
      return;
    }
    if (profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setRenameError(t("profiles:errors.duplicateName"));
      return;
    }
    setRenameError("");
    await renameProfileMutation.mutateAsync({ id: pendingProfileId, newName: trimmed });
    setIsRenameOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-semibold text-text-primary">{t("profiles:title")}</h4>
          <p className="text-sm text-text-secondary">{t("profiles:description")}</p>
        </div>
        <Button variant="secondary" leftIcon={Plus} onClick={() => setIsCreateOpen(true)} isLoading={isLoading}>
          {t("profiles:buttons.create")}
        </Button>
      </div>

      {activeProfile && (
        <Card variant="accent" className="flex items-center gap-3">
          <User size={20} className="shrink-0 text-accent-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-accent-primary">{activeProfile.name}</p>
            <p className="text-xs text-accent-primary/80">{t("profiles:activeLabel")}</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent-primary/20 px-2.5 py-0.5 text-xs font-semibold text-accent-primary">
            {t("profiles:activeBadge")}
          </span>
        </Card>
      )}

      {profiles.length === 0 && !isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface p-4 text-sm text-text-secondary">
          <AlertCircle size={18} className="shrink-0 text-text-tertiary" />
          {t("profiles:noProfiles")}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="space-y-2">
          {profiles.map((profile) => {
            const isActive = activeProfile?.id === profile.id;
            return (
              <Card
                key={profile.id}
                variant={isActive ? "accent" : "default"}
                className="flex items-center gap-3"
              >
                <User size={18} className={isActive ? "text-accent-primary" : "shrink-0 text-text-tertiary"} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isActive ? "text-accent-primary" : "text-text-primary"}`}>
                    {profile.name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isActive ? (
                    <span className="rounded-full bg-accent-primary/20 px-2.5 py-0.5 text-xs font-semibold text-accent-primary">
                      {t("profiles:activeBadge")}
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openSwitch(profile.id, profile.name)}
                      isLoading={isLoading}
                    >
                      {t("profiles:buttons.activate")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Edit3}
                    onClick={() => openRename(profile.id, profile.name)}
                    isLoading={isLoading}
                  >
                      {t("profiles:buttons.rename")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Trash2}
                    onClick={() => openDelete(profile.id, profile.name)}
                    disabled={isActive || profiles.length <= 1}
                    isLoading={isLoading}
                  >
                      {t("profiles:buttons.delete")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {profiles.length > 1 && <ProfileComparison />}

      <CreateProfileModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateError("");
        }}
        onConfirm={handleCreateConfirm}
        isLoading={isLoading}
        error={createError}
      />
      <DeleteProfileModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        profileName={pendingProfileName}
        isLoading={isLoading}
      />
      <SwitchProfileModal
        isOpen={isSwitchOpen}
        onClose={() => setIsSwitchOpen(false)}
        onConfirm={handleSwitchConfirm}
        profileName={pendingProfileName}
        isLoading={isLoading}
      />
      <RenameProfileModal
        isOpen={isRenameOpen}
        onClose={() => {
          setIsRenameOpen(false);
          setRenameError("");
        }}
        onConfirm={handleRenameConfirm}
        currentName={renameCurrentName}
        isLoading={isLoading}
        error={renameError}
      />
    </div>
  );
}

/** Side-by-side stats for all profiles ("my accounts"). */
function ProfileComparison() {
  const { t } = useTranslation(["profiles", "common"]);
  const { data, isLoading } = useQuery({
    queryKey: ["profileComparison"],
    queryFn: getProfileComparison,
    staleTime: 60_000,
  });

  const rows = data ?? [];
  if (isLoading && rows.length === 0) return null;

  const formatRate = (rate: number | null) =>
    rate == null ? "—" : `${Math.round(rate * 100)}%`;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border-subtle px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {t("profiles:comparison.title")}
        </p>
        <p className="text-xs text-text-secondary">
          {t("profiles:comparison.description")}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border-subtle text-text-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("profiles:comparison.profile")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("profiles:comparison.matches")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("profiles:comparison.winRate")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("profiles:comparison.training")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("profiles:comparison.lastMatch")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/60">
            {rows.map((row) => (
              <tr key={row.id} className="text-text-secondary">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    {row.isActive && (
                      <Crown size={12} className="text-accent-primary" aria-hidden="true" />
                    )}
                    <span className="font-medium text-text-primary">{row.name}</span>
                    {row.playerName && (
                      <span className="truncate text-text-tertiary">· {row.playerName}</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{row.matches}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatRate(row.winRate)}
                </td>
                <td className="px-4 py-2 text-right font-mono">{row.trainingSessions}</td>
                <td className="px-4 py-2 text-right">
                  {row.lastMatchAt
                    ? formatDateTime(Date.parse(row.lastMatchAt))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
