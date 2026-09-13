import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import {
  addTournamentTeam,
  deleteTournament,
  generateTournamentBracket,
  getTournamentSnapshot,
  listTeams,
  listTournaments,
  removeTournamentTeam,
  reportTournamentMatch,
  saveTournament,
  setTournamentTeamCheckedIn,
  startTournamentMatchSeries,
} from "@/lib/api";
import type {
  BroadcastTeam,
  Tournament,
  TournamentMatch,
  TournamentSnapshot,
} from "@/lib/types";
import { CalendarPlus, Play, Plus, Swords, Trash2, Trophy } from "lucide-react";

interface TournamentPanelProps {
  onSeriesStarted: () => void;
}

function roundLabel(round: number, total: number): string {
  if (total <= 1) return "Final";
  const remaining = total - round;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinales";
  if (remaining === 2) return "Cuartos";
  return `Ronda ${round}`;
}

/**
 * Tournament manager: registration with check-in, bracket generation
 * (single elimination / round robin), result reporting with automatic
 * advancement and one-click "start series" so the Control Room follows the
 * live match.
 */
export function TournamentPanel({ onSeriesStarted }: TournamentPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [teams, setTeams] = useState<BroadcastTeam[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("single_elim");
  const [bestOf, setBestOf] = useState("3");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});

  const refresh = useCallback(
    async (tournamentId?: string) => {
      const [list, teamList] = await Promise.all([listTournaments(), listTeams()]);
      setTournaments(list);
      setTeams(teamList);
      const targetId =
        tournamentId ?? selectedId ?? (list.length ? list[0].id : "");
      setSelectedId(targetId);
      if (targetId) {
        setSnapshot(await getTournamentSnapshot(targetId));
      } else {
        setSnapshot(null);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  const registeredIds = useMemo(
    () => new Set((snapshot?.teams ?? []).map((entry) => entry.teamId)),
    [snapshot],
  );

  const create = async () => {
    if (!name.trim()) return;
    try {
      const tournament = await saveTournament({
        name: name.trim(),
        format,
        bestOf: Number(bestOf) || 3,
      });
      setName("");
      await refresh(tournament.id);
      addToast({ type: "success", title: t("overlay:broadcast.tournament.created") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const register = async (teamId: string) => {
    if (!selectedId) return;
    await addTournamentTeam(selectedId, teamId);
    await refresh(selectedId);
  };

  const unregister = async (teamId: string) => {
    if (!selectedId) return;
    await removeTournamentTeam(selectedId, teamId);
    await refresh(selectedId);
  };

  const generate = async () => {
    if (!selectedId) return;
    try {
      await generateTournamentBracket(selectedId);
      await refresh(selectedId);
      addToast({ type: "success", title: t("overlay:broadcast.tournament.generated") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const report = async (match: TournamentMatch) => {
    const entry = scores[match.id];
    const scoreA = Number(entry?.a ?? match.scoreA) || 0;
    const scoreB = Number(entry?.b ?? match.scoreB) || 0;
    if (scoreA === scoreB) {
      addToast({ type: "error", title: t("overlay:broadcast.tournament.noDraw") });
      return;
    }
    try {
      await reportTournamentMatch({
        matchId: match.id,
        scoreA,
        scoreB,
      });
      await refresh(selectedId);
      addToast({ type: "success", title: t("overlay:broadcast.tournament.reported") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const startSeries = async (match: TournamentMatch) => {
    try {
      await startTournamentMatchSeries(match.id);
      await refresh(selectedId);
      onSeriesStarted();
      addToast({
        type: "success",
        title: t("overlay:broadcast.tournament.seriesStarted"),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  const teamById = (id?: string | null) =>
    (snapshot?.teams ?? []).find((entry) => entry.teamId === id)?.team;

  const rounds = useMemo(() => {
    const map = new Map<number, TournamentMatch[]>();
    (snapshot?.matches ?? []).forEach((match) => {
      const list = map.get(match.round) ?? [];
      list.push(match);
      map.set(match.round, list);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [snapshot]);

  const totalRounds = snapshot?.rounds ?? 0;

  const standings = useMemo(() => {
    if (selected?.format !== "round_robin") return [];
    const table = new Map<string, { wins: number; losses: number }>();
    (snapshot?.teams ?? []).forEach((entry) =>
      table.set(entry.teamId, { wins: 0, losses: 0 }),
    );
    (snapshot?.matches ?? []).forEach((match) => {
      if (match.status !== "finished" || !match.winnerTeamId) return;
      const loserId =
        match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
      if (match.winnerTeamId) {
        const winner = table.get(match.winnerTeamId) ?? { wins: 0, losses: 0 };
        winner.wins += 1;
        table.set(match.winnerTeamId, winner);
      }
      if (loserId) {
        const loser = table.get(loserId) ?? { wins: 0, losses: 0 };
        loser.losses += 1;
        table.set(loserId, loser);
      }
    });
    return [...table.entries()].sort((a, b) => b[1].wins - a[1].wins);
  }, [selected, snapshot]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Trophy className="h-4 w-4 text-accent-primary" aria-hidden />
            {t("overlay:broadcast.tournament.title")}
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              aria-label={t("overlay:broadcast.tournament.select")}
              options={[
                { value: "", label: t("overlay:broadcast.tournament.select") },
                ...tournaments.map((tournament) => ({
                  value: tournament.id,
                  label: `${tournament.name} · ${tournament.status}`,
                })),
              ]}
              value={selectedId}
              onChange={(value) => void refresh(value)}
              size="sm"
            />
            {selected && (
              <Button
                size="sm"
                variant="ghost"
                className="text-accent-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
          <Input
            label={t("overlay:broadcast.tournament.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            size="sm"
            containerClassName="w-52"
          />
          <Select
            aria-label={t("overlay:broadcast.tournament.format")}
            options={[
              { value: "single_elim", label: t("overlay:broadcast.tournament.singleElim") },
              { value: "round_robin", label: t("overlay:broadcast.tournament.roundRobin") },
            ]}
            value={format}
            onChange={setFormat}
            size="sm"
          />
          <Input
            label="BO"
            type="number"
            min={1}
            max={9}
            value={bestOf}
            onChange={(event) => setBestOf(event.target.value)}
            size="sm"
            containerClassName="w-20"
          />
          <Button size="sm" disabled={!name.trim()} onClick={() => void create()}>
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.tournament.create")}
          </Button>
        </div>
      </Card>

      {selected && snapshot?.available && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              {t("overlay:broadcast.tournament.registration")} ·{" "}
              {(snapshot.teams ?? []).length}
            </h3>
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {(snapshot.teams ?? []).map((entry) => (
                <li
                  key={entry.teamId}
                  className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-panel px-2.5 py-1.5"
                >
                  <span className="w-6 font-mono text-[11px] text-text-tertiary">
                    #{entry.seed}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {entry.team?.name ?? entry.teamId}
                  </span>
                  <button
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      entry.checkedIn
                        ? "bg-accent-success-subtle text-accent-success"
                        : "bg-bg-elevated text-text-tertiary"
                    }`}
                    onClick={() =>
                      void setTournamentTeamCheckedIn(
                        selected.id,
                        entry.teamId,
                        !entry.checkedIn,
                      ).then(() => refresh(selected.id))
                    }
                  >
                    {entry.checkedIn
                      ? t("overlay:broadcast.tournament.checkedIn")
                      : t("overlay:broadcast.tournament.checkIn")}
                  </button>
                  <button
                    type="button"
                    className="text-accent-danger"
                    onClick={() => void unregister(entry.teamId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              {(snapshot.teams ?? []).length === 0 && (
                <li className="text-xs text-text-muted">
                  {t("overlay:broadcast.tournament.noTeams")}
                </li>
              )}
            </ul>

            <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              {t("overlay:broadcast.tournament.availableTeams")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {teams
                .filter((team) => !registeredIds.has(team.id))
                .map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => void register(team.id)}
                    className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:border-accent-primary/60 hover:text-text-primary"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {team.name}
                  </button>
                ))}
            </div>

            <Button
              size="sm"
              className="mt-4 w-full"
              disabled={(snapshot.teams ?? []).length < 2}
              onClick={() => void generate()}
            >
              <Swords className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.tournament.generate")}
            </Button>
          </Card>

          <Card className="p-4">
            {rounds.length === 0 ? (
              <p className="text-xs text-text-muted">
                {t("overlay:broadcast.tournament.noBracket")}
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {rounds.map(([round, matches]) => (
                  <div key={round} className="min-w-[220px] space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                      {roundLabel(round, totalRounds)}
                    </p>
                    {matches.map((match) => {
                      const teamA = teamById(match.teamAId);
                      const teamB = teamById(match.teamBId);
                      const entry = scores[match.id] ?? {
                        a: String(match.scoreA),
                        b: String(match.scoreB),
                      };
                      const ready = Boolean(match.teamAId && match.teamBId);
                      const finished = match.status === "finished";
                      return (
                        <div
                          key={match.id}
                          className="rounded-lg border border-border-subtle bg-bg-panel p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`truncate text-xs ${
                                match.winnerTeamId === match.teamAId
                                  ? "font-bold text-accent-success"
                                  : "text-text-secondary"
                              }`}
                            >
                              {teamA?.tag ?? teamA?.name ?? "—"}
                            </span>
                            <input
                              className="w-10 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center font-mono text-xs"
                              value={entry.a}
                              disabled={!ready || finished}
                              onChange={(event) =>
                                setScores((current) => ({
                                  ...current,
                                  [match.id]: { ...entry, a: event.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span
                              className={`truncate text-xs ${
                                match.winnerTeamId === match.teamBId
                                  ? "font-bold text-accent-success"
                                  : "text-text-secondary"
                              }`}
                            >
                              {teamB?.tag ?? teamB?.name ?? "—"}
                            </span>
                            <input
                              className="w-10 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center font-mono text-xs"
                              value={entry.b}
                              disabled={!ready || finished}
                              onChange={(event) =>
                                setScores((current) => ({
                                  ...current,
                                  [match.id]: { ...entry, b: event.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            {finished ? (
                              <Badge variant="success">
                                {t("overlay:broadcast.tournament.finished")}
                              </Badge>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!ready}
                                  onClick={() => void report(match)}
                                >
                                  {t("overlay:broadcast.tournament.report")}
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={!ready}
                                  onClick={() => void startSeries(match)}
                                >
                                  <Play className="h-3.5 w-3.5" aria-hidden />
                                  {t("overlay:broadcast.tournament.startSeries")}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {standings.length > 0 && (
              <div className="mt-4 border-t border-border-subtle pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                  {t("overlay:broadcast.tournament.standings")}
                </p>
                <ul className="space-y-1">
                  {standings.map(([teamId, record], index) => (
                    <li
                      key={teamId}
                      className="flex items-center gap-3 rounded bg-bg-panel px-3 py-1.5 text-xs"
                    >
                      <span className="font-mono text-text-tertiary">{index + 1}</span>
                      <span className="flex-1 text-text-primary">
                        {teamById(teamId)?.name ?? teamId}
                      </span>
                      <span className="font-mono text-accent-success">
                        {record.wins}V
                      </span>
                      <span className="font-mono text-text-muted">
                        {record.losses}D
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDelete}
        title={t("overlay:broadcast.tournament.delete")}
        description={t("overlay:broadcast.tournament.deleteConfirm")}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (selected) {
            void deleteTournament(selected.id).then(async () => {
              setConfirmDelete(false);
              setSelectedId("");
              await refresh("");
            });
          }
        }}
      />
    </div>
  );
}
