import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import {
  createSeries,
  deleteSeries,
  recordSeriesGame,
  resetSeries,
  updateSeriesScore,
} from "@/lib/api";
import type { BroadcastTeam, SeriesSnapshot } from "@/lib/types";
import { Medal, Plus, RotateCcw, Trash2 } from "lucide-react";

interface SeriesPanelProps {
  series: SeriesSnapshot | null;
  teams: BroadcastTeam[];
  port: number;
  onRefresh: () => void;
}

export function SeriesPanel({ series, teams, port, onRefresh }: SeriesPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Serie");
  const [format, setFormat] = useState("3");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = series?.available ? series : null;
  const teamOptions = [
    { value: "", label: t("overlay:broadcast.series.selectTeam") },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];

  const handleCreate = async () => {
    try {
      await createSeries({
        name: name.trim() || "Serie",
        format: Number(format),
        teamAId: teamA || null,
        teamBId: teamB || null,
      });
      setCreating(false);
      onRefresh();
      addToast({ type: "success", title: t("overlay:broadcast.series.created") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const changeScore = async (side: "A" | "B", delta: number) => {
    if (!active) return;
    const scoreA = Math.max(0, (active.scoreA ?? 0) + (side === "A" ? delta : 0));
    const scoreB = Math.max(0, (active.scoreB ?? 0) + (side === "B" ? delta : 0));
    await updateSeriesScore(scoreA, scoreB);
    onRefresh();
  };

  const recordGame = async (winner: "A" | "B") => {
    if (!active) return;
    const winnerId =
      winner === "A" ? active.teamA?.id : active.teamB?.id;
    await recordSeriesGame({
      winnerTeamId: winnerId ?? null,
      scoreA: winner === "A" ? 1 : 0,
      scoreB: winner === "B" ? 1 : 0,
    });
    onRefresh();
  };

  if (!active) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.series.title")}
          </h2>
          <Button size="sm" variant="secondary" onClick={() => setCreating((open) => !open)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.series.create")}
          </Button>
        </div>
        {creating ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={t("overlay:broadcast.series.name")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              size="sm"
            />
            <Input
              label={t("overlay:broadcast.series.format")}
              type="number"
              min={1}
              max={9}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              size="sm"
            />
            <Select
              aria-label={t("overlay:broadcast.series.teamA")}
              options={teamOptions}
              value={teamA}
              onChange={setTeamA}
              size="sm"
            />
            <Select
              aria-label={t("overlay:broadcast.series.teamB")}
              options={teamOptions}
              value={teamB}
              onChange={setTeamB}
              size="sm"
            />
            <div className="sm:col-span-2">
              <Button size="sm" onClick={() => void handleCreate()}>
                {t("overlay:broadcast.series.start")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-muted">
            {t("overlay:broadcast.series.none")}
          </p>
        )}
      </Card>
    );
  }

  const needed = active.winsNeeded ?? 2;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Medal className="h-4 w-4 text-accent-primary" aria-hidden />
          {t("overlay:broadcast.series.title")}
          <span className="font-mono text-[11px] text-text-tertiary">BO{active.format}</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void resetSeries().then(onRefresh)}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.series.reset")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-accent-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {(["A", "B"] as const).map((side) => {
          const team = side === "A" ? active.teamA : active.teamB;
          const score = side === "A" ? active.scoreA : active.scoreB;
          const color = team?.colorPrimary || (side === "A" ? "#3b82f6" : "#f97316");
          return (
            <div
              key={side}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2"
            >
              <span
                className="h-8 w-1.5 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              {team?.logoUrl ? (
                <img
                  src={`http://127.0.0.1:${port || 9528}${team.logoUrl}`}
                  alt=""
                  className="h-8 w-8 object-contain"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                {team ? team.name : t("overlay:broadcast.series.selectTeam")}
              </span>
              <span className="font-mono text-xl font-bold text-text-primary">{score}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => void changeScore(side, -1)}>
                  −
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void changeScore(side, 1)}>
                  +
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={(score ?? 0) >= needed}
                onClick={() => void recordGame(side)}
              >
                {t("overlay:broadcast.series.nextMap")}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        {t("overlay:broadcast.series.played", { played: active.games?.length ?? 0 })}
        {active.status === "finished"
          ? ` · ${t("overlay:broadcast.series.finished")}`
          : ` · ${t("overlay:broadcast.series.live")}`}
      </p>

      <ConfirmModal
        isOpen={confirmDelete}
        title={t("overlay:broadcast.series.delete")}
        description={t("overlay:broadcast.series.deleteConfirm")}
        confirmLabel={t("common:actions.delete")}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (active.id) {
            void deleteSeries(active.id).then(() => {
              setConfirmDelete(false);
              onRefresh();
            });
          }
        }}
      />
    </Card>
  );
}
