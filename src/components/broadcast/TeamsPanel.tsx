import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import {
  addTeamRosterPlayer,
  deleteBroadcastAsset,
  deleteTeam,
  listBroadcastAssets,
  listTeamRoster,
  listTeams,
  removeTeamRosterPlayer,
  saveTeam,
  uploadBroadcastAsset,
} from "@/lib/api";
import type { BroadcastAsset, BroadcastTeam, TeamPlayer } from "@/lib/types";
import { Plus, Save, Trash2, Upload } from "lucide-react";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface TeamsPanelProps {
  port: number;
  onChanged: () => void;
}

/** Team library: names, tags, colors and uploaded logos for the overlays. */
export function TeamsPanel({ port, onChanged }: TeamsPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [teams, setTeams] = useState<BroadcastTeam[]>([]);
  const [logos, setLogos] = useState<BroadcastAsset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#3b82f6");
  const [colorSecondary, setColorSecondary] = useState("#1d4ed8");
  const [logoAssetId, setLogoAssetId] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [roster, setRoster] = useState<TeamPlayer[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");

  const load = useCallback(async () => {
    const [teamList, assets] = await Promise.all([
      listTeams(),
      listBroadcastAssets("logo"),
    ]);
    setTeams(teamList);
    setLogos(assets);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setRoster([]);
    setEditingId(null);
    setName("");
    setTag("");
    setColorPrimary("#3b82f6");
    setColorSecondary("#1d4ed8");
    setLogoAssetId("");
  };

  const startEdit = (team: BroadcastTeam) => {
    void listTeamRoster(team.id).then(setRoster);
    setEditingId(team.id);
    setName(team.name);
    setTag(team.tag);
    setColorPrimary(team.colorPrimary || "#3b82f6");
    setColorSecondary(team.colorSecondary || "#1d4ed8");
    setLogoAssetId(team.logoAssetId ?? "");
  };

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await saveTeam({
        id: editingId,
        name: name.trim(),
        tag: tag.trim(),
        colorPrimary,
        colorSecondary,
        logoAssetId: logoAssetId || null,
      });
      resetForm();
      await load();
      onChanged();
      addToast({ type: "success", title: t("overlay:broadcast.teams.saved") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const uploadLogo = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const asset = await uploadBroadcastAsset({
        kind: "logo",
        name: file.name,
        mime: file.type || "image/png",
        dataBase64: dataUrl,
      });
      setLogos((current) => [asset, ...current]);
      setLogoAssetId(asset.id);
      addToast({ type: "success", title: t("overlay:broadcast.teams.uploaded") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const removeLogoAsset = async (assetId: string) => {
    await deleteBroadcastAsset(assetId);
    setLogos((current) => current.filter((asset) => asset.id !== assetId));
    if (logoAssetId === assetId) setLogoAssetId("");
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {editingId
            ? t("overlay:broadcast.teams.edit")
            : t("overlay:broadcast.teams.add")}
        </h2>
        <div className="space-y-3">
          <Input
            label={t("overlay:broadcast.teams.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            size="sm"
          />
          <Input
            label={t("overlay:broadcast.teams.tag")}
            value={tag}
            maxLength={6}
            onChange={(event) => setTag(event.target.value)}
            size="sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label={t("overlay:broadcast.teams.colorPrimary")}
              type="color"
              value={colorPrimary}
              onChange={(event) => setColorPrimary(event.target.value)}
              size="sm"
            />
            <Input
              label={t("overlay:broadcast.teams.colorSecondary")}
              type="color"
              value={colorSecondary}
              onChange={(event) => setColorSecondary(event.target.value)}
              size="sm"
            />
          </div>
          <Select
            aria-label={t("overlay:broadcast.teams.logo")}
            options={[
              { value: "", label: t("overlay:broadcast.teams.noLogo") },
              ...logos.map((asset) => ({
                value: asset.id,
                label: asset.name,
              })),
            ]}
            value={logoAssetId}
            onChange={setLogoAssetId}
            size="sm"
          />
          <div className="flex items-center gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => logoInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.teams.upload")}
            </Button>
            {logoAssetId && (
              <Button
                size="sm"
                variant="ghost"
                className="text-accent-danger"
                onClick={() => void removeLogoAsset(logoAssetId)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void submit()} disabled={!name.trim()}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.teams.save")}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={resetForm}>
                {t("common:actions.cancel")}
              </Button>
            )}
          </div>

          {editingId && (
            <div className="border-t border-border-subtle pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t("overlay:broadcast.teams.roster")} · {roster.length}
              </p>
              <ul className="mb-2 space-y-1">
                {roster.length === 0 && (
                  <li className="text-xs text-text-muted">
                    {t("overlay:broadcast.teams.rosterEmpty")}
                  </li>
                )}
                {roster.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-2 rounded bg-bg-panel px-2 py-1"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                      {player.name}
                    </span>
                    {player.primaryId && (
                      <span className="truncate font-mono text-[10px] text-text-tertiary">
                        {player.primaryId}
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-accent-danger"
                      onClick={() =>
                        void removeTeamRosterPlayer(player.id).then(() =>
                          setRoster((current) =>
                            current.filter((entry) => entry.id !== player.id),
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-end gap-1.5">
                <Input
                  placeholder={t("overlay:broadcast.teams.playerName")}
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  size="sm"
                  containerClassName="flex-1"
                />
                <Input
                  placeholder={t("overlay:broadcast.teams.playerId")}
                  value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)}
                  size="sm"
                  containerClassName="w-32"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!playerName.trim()}
                  onClick={() =>
                    void addTeamRosterPlayer(
                      editingId,
                      playerName.trim(),
                      playerId.trim() || null,
                    ).then((player) => {
                      setRoster((current) => [...current, player]);
                      setPlayerName("");
                      setPlayerId("");
                      addToast({
                        type: "success",
                        title: t("overlay:broadcast.teams.playerAdded"),
                      });
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Plus className="h-4 w-4 text-accent-primary" aria-hidden />
          {t("overlay:broadcast.teams.title")} · {teams.length}
        </h2>
        {teams.length === 0 ? (
          <p className="text-xs text-text-muted">{t("overlay:broadcast.teams.empty")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-panel p-3"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated"
                  aria-hidden
                >
                  {team.logoAssetId ? (
                    <img
                      src={`http://127.0.0.1:${port || 9528}/assets/${
                        logos.find((asset) => asset.id === team.logoAssetId)?.fileName ?? ""
                      }`}
                      alt=""
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <span
                      className="h-6 w-6 rounded-full"
                      style={{ background: team.colorPrimary || "#3b82f6" }}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {team.name}
                  </p>
                  <p className="text-[11px] text-text-muted">{team.tag}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => startEdit(team)}>
                  {t("common:actions.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-accent-danger"
                  onClick={() => setConfirmId(team.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal
        isOpen={confirmId !== null}
        title={t("overlay:broadcast.teams.delete")}
        description={t("overlay:broadcast.teams.deleteConfirm")}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) {
            void deleteTeam(confirmId).then(async () => {
              setConfirmId(null);
              await load();
              onChanged();
            });
          }
        }}
      />
    </div>
  );
}
