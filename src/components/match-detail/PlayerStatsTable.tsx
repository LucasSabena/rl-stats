import { memo, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "@/components/ui/DataTable";
import { cn } from "@/lib/utils";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { Crown, Medal } from "lucide-react";
import { useFriends } from "@/hooks/useFriends";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PlayerStats, Team } from "@/lib/types";

interface PlayerStatsTableProps {
  players: PlayerStats[];
}

type Tab = "table" | "compare";
type StatKey = "goals" | "assists" | "saves" | "shots" | "score" | "demos" | "touches" | "kickoffGoals";

export const PlayerStatsTable = memo(function PlayerStatsTable({
  players,
}: PlayerStatsTableProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();
  const [tab, setTab] = useState<Tab>("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const STAT_KEYS: { key: StatKey; label: string }[] = useMemo(() => [
    { key: "goals", label: t("matchDetail:stats.goals") },
    { key: "assists", label: t("matchDetail:stats.assists") },
    { key: "saves", label: t("matchDetail:stats.saves") },
    { key: "shots", label: t("matchDetail:stats.shots") },
    { key: "score", label: t("matchDetail:stats.score") },
    { key: "demos", label: t("matchDetail:stats.demos") },
    { key: "kickoffGoals", label: t("matchDetail:stats.kickoffGoals") },
    { key: "touches", label: t("matchDetail:stats.touches") },
  ], [t]);

  const sortedAllPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  const bestScore = useMemo(
    () => (players.length > 0 ? Math.max(...players.map((p) => p.score)) : 0),
    [players]
  );

  const columns = [
    {
      key: "name",
      header: t("matchDetail:stats.player"),
      sortable: true,
      render: (p: PlayerStats) => {
        const rank = sortedAllPlayers.findIndex((item) => item.id === p.id) + 1;
        const isMVP = rank === 1;
        const isTop3 = rank <= 3;
        
        return (
          <div className="flex items-center gap-2">
            {isMVP && (
              <span className="inline-flex items-center gap-1 rounded bg-accent-warning/10 px-1 py-0.5 text-[10px] font-bold text-accent-warning ring-1 ring-inset ring-accent-warning/20">
                <Crown size={8} />
                MVP
              </span>
            )}
            {isTop3 && (
              <div 
                className={cn(
                  "flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold",
                  rank === 1 ? "text-yellow-400 bg-yellow-400/10" :
                  rank === 2 ? "text-gray-300 bg-gray-300/10" :
                  "text-orange-400 bg-orange-400/10"
                )}
              >
                <Medal size={10} />
                {rank}º
              </div>
            )}
            <PlayerLink player={p.id} name={p.name} className="font-medium text-text-primary" />
            {friends?.some((f) => f.primary_id === p.id) && (
              <span className="shrink-0 rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-primary">
                {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "team",
      header: t("matchDetail:stats.team"),
      sortable: true,
      render: (p: PlayerStats) =>
        p.team === 0 ? (
          <span className="rounded-full bg-team-blue-bg px-2 py-0.5 text-xs font-medium text-team-blue">
            {t("matchDetail:teams.blue")}
          </span>
        ) : (
          <span className="rounded-full bg-team-orange-bg px-2 py-0.5 text-xs font-medium text-team-orange">
            {t("teams.orange")}
          </span>
        ),
    },
    { key: "score", header: t("stats.score"), sortable: true },
    { key: "goals", header: t("stats.goals"), sortable: true },
    { key: "assists", header: t("stats.assistsShort"), sortable: true },
    { key: "saves", header: t("stats.saves"), sortable: true },
    { key: "shots", header: t("stats.shots"), sortable: true },
    { key: "demos", header: t("stats.demos"), sortable: true },
    { key: "kickoffGoals", header: t("stats.kickoffGoalsShort"), sortable: true },
    { key: "touches", header: t("stats.touches"), sortable: true },
  ];

  const compareColumns = [
    {
      key: "__select",
      header: "",
      render: (p: PlayerStats) => (
        <input
          type="checkbox"
          checked={selectedIds.has(p.id)}
          onChange={() => toggleSelect(p.id)}
          className="h-4 w-4 rounded border-border-highlight bg-bg-panel text-accent-primary focus:ring-accent-primary/30"
        />
      ),
    },
    ...columns,
  ];

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.has(p.id)),
    [players, selectedIds]
  );

  const chartData = useMemo(() => {
    return STAT_KEYS.map(({ key, label }) => {
      const entry: Record<string, string | number> = { stat: label };
      selectedPlayers.forEach((p) => {
        entry[p.name] = p[key] ?? 0;
      });
      return entry;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayers]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t("stats.title")}
        </h3>

        <div className="flex rounded-lg border border-border-subtle bg-bg-panel p-0.5">
          <button
            onClick={() => setTab("table")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
              tab === "table"
                ? "bg-accent-primary text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {t("stats.tabTable")}
          </button>
          <button
            onClick={() => setTab("compare")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
              tab === "compare"
                ? "bg-accent-primary text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {t("stats.tabCompare")}
          </button>
        </div>
      </div>

      {tab === "table" ? (
        <DataTable
          columns={columns}
          data={players}
          keyExtractor={(p) => p.id}
          emptyMessage={t("stats.emptyData")}
          rowClassName={(p: PlayerStats) =>
            p.score === bestScore ? "bg-accent-primary-muted" : undefined
          }
        />
      ) : (
        <div>
          <DataTable
            columns={compareColumns}
            data={players}
            keyExtractor={(p) => p.id}
            emptyMessage={t("stats.emptyData")}
          />

          <div className="mt-6 rounded-xl border border-border-subtle bg-bg-surface p-4">
            {selectedPlayers.length >= 2 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="stat"
                      tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                      axisLine={{ stroke: "var(--color-border-subtle)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-highlight)",
                        borderRadius: "10px",
                        color: "var(--color-text-primary)",
                      }}
                      labelStyle={{ color: "var(--color-text-primary)" }}
                    />
                    {selectedPlayers.map((player) => (
                      <Bar
                        key={player.id}
                        dataKey={player.name}
                        fill={getTeamBarColor(player.team)}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-text-secondary">
                  {t("stats.selectPlayers")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function getTeamBarColor(team: Team): string {
  if (team === 0) return "var(--color-team-blue)";
  if (team === 1) return "var(--color-team-orange)";
  return "var(--color-text-muted)";
}
