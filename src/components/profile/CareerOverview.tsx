import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { HoursWheel } from "@/components/analytics/HoursWheel";
import { cn, formatNumber } from "@/lib/utils";
import type { AnalyticsData, InsightsData } from "@/lib/types";

interface CareerOverviewProps {
  data?: AnalyticsData;
  insights?: InsightsData;
  isLoading: boolean;
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-3.5">
      <p className="text-[13px] text-text-secondary">{label}</p>
      <p
        className={cn(
          "numeral mt-1.5 text-[24px] leading-none",
          tone === "good" && "text-accent-success",
          tone === "bad" && "text-accent-danger",
          tone === "default" && "text-text-primary",
        )}
      >
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}

/**
 * A career view assembled entirely from the local match database.
 *
 * The tracker/MMR integrations this page used to depend on can no longer be
 * authenticated, so nothing here calls out to a third party — every number
 * comes from matches already recorded on this machine.
 */
export function CareerOverview({ data, insights, isLoading }: CareerOverviewProps) {
  const { t } = useTranslation(["profiles", "analytics", "common"]);

  const contribution = useMemo(() => {
    if (!insights?.contrib) return [];
    const c = insights.contrib;
    return [
      { key: "goals", label: t("analytics:stats.goals", { defaultValue: "Goles" }), pct: c.goalsPct },
      { key: "assists", label: t("analytics:stats.assists", { defaultValue: "Asistencias" }), pct: c.assistsPct },
      { key: "saves", label: t("analytics:stats.saves", { defaultValue: "Paradas" }), pct: c.savesPct },
      { key: "shots", label: t("analytics:stats.shots", { defaultValue: "Tiros" }), pct: c.shotsPct },
      { key: "demos", label: t("analytics:stats.demos", { defaultValue: "Demos" }), pct: c.demosPct },
    ].filter((row) => Number.isFinite(row.pct));
  }, [insights?.contrib, t]);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.totalMatches === 0) return null;

  const streakLabel =
    data.currentStreak > 0
      ? t("profiles:career.streakWins", {
          count: data.currentStreak,
          defaultValue: "{{count}} victorias seguidas",
        })
      : data.currentStreak < 0
        ? t("profiles:career.streakLosses", {
            count: Math.abs(data.currentStreak),
            defaultValue: "{{count}} derrotas seguidas",
          })
        : t("profiles:career.streakNone", { defaultValue: "Sin racha" });

  return (
    <div className="flex flex-col gap-6">
      {/* Career totals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={t("profiles:career.matches", { defaultValue: "Partidas" })}
          value={data.totalMatches}
          hint={t("profiles:career.record", {
            wins: data.wins,
            losses: data.losses,
            defaultValue: "{{wins}}V · {{losses}}D",
          })}
        />
        <Metric
          label={t("profiles:career.winRate", { defaultValue: "Win rate" })}
          value={`${Math.round(data.winRate)}%`}
          tone={data.winRate >= 50 ? "good" : "bad"}
        />
        <Metric
          label={t("profiles:career.bestStreak", { defaultValue: "Mejor racha" })}
          value={data.bestStreak}
          hint={streakLabel}
        />
        <Metric
          label={t("profiles:career.avgScore", { defaultValue: "Puntuación media" })}
          value={Math.round(data.avgScore)}
        />
        <Metric
          label={t("profiles:career.goals", { defaultValue: "Goles" })}
          value={data.totalGoals}
          hint={`${data.avgGoals.toFixed(1)} / ${t("profiles:career.perMatch", { defaultValue: "partida" })}`}
        />
        <Metric
          label={t("profiles:career.assists", { defaultValue: "Asistencias" })}
          value={data.totalAssists}
          hint={`${data.avgAssists.toFixed(1)} / ${t("profiles:career.perMatch", { defaultValue: "partida" })}`}
        />
        <Metric
          label={t("profiles:career.saves", { defaultValue: "Paradas" })}
          value={data.totalSaves}
          hint={`${data.avgSaves.toFixed(1)} / ${t("profiles:career.perMatch", { defaultValue: "partida" })}`}
        />
        <Metric
          label={t("profiles:career.kickoffGoals", { defaultValue: "Goles de saque" })}
          value={data.totalKickoffGoalsScored}
          hint={t("profiles:career.kickoffConceded", {
            count: data.totalKickoffGoalsConceded,
            defaultValue: "{{count}} recibidos",
          })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* How you contribute to your team's output */}
        {contribution.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-medium text-text-primary">
              {t("profiles:career.contribution", { defaultValue: "Tu aporte al equipo" })}
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              {t("profiles:career.contributionHelp", {
                defaultValue: "Porcentaje del total del equipo que aportás vos.",
              })}
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {contribution.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[13px] text-text-secondary">
                    {row.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-secondary">
                    <div
                      className="h-full rounded-full bg-accent-primary"
                      style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                    />
                  </div>
                  <span className="numeral w-10 shrink-0 text-right text-[13px] text-text-primary">
                    {Math.round(row.pct)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Performance in different kinds of game */}
        {insights?.available && (
          <Card className="p-4">
            <h3 className="text-sm font-medium text-text-primary">
              {t("profiles:career.clutch", { defaultValue: "Cómo respondés bajo presión" })}
            </h3>
            <div className="mt-4 flex flex-col gap-3">
              {[
                {
                  label: t("profiles:career.overtime", { defaultValue: "Prórroga" }),
                  games: insights.otGames,
                  rate: insights.otWinRate,
                },
                {
                  label: t("profiles:career.closeGames", { defaultValue: "Partidos ajustados" }),
                  games: insights.closeGames,
                  rate: insights.closeWinRate,
                },
                {
                  label: t("profiles:career.blowouts", { defaultValue: "Goleadas" }),
                  games: insights.blowoutGames,
                  rate: insights.blowoutWinRate,
                },
              ]
                .filter((row) => (row.games ?? 0) > 0)
                .map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-text-secondary">{row.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "numeral text-[15px]",
                          (row.rate ?? 0) >= 50
                            ? "text-accent-success"
                            : "text-accent-danger",
                        )}
                      >
                        {Math.round(row.rate ?? 0)}%
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {t("profiles:career.games", {
                          count: row.games ?? 0,
                          defaultValue: "{{count}} partidas",
                        })}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        )}
      </div>

      {/* Playlists */}
      {insights?.playlists && insights.playlists.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {t("profiles:career.playlists", { defaultValue: "Por playlist" })}
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-text-tertiary">
                  <th className="py-1.5 pr-3 font-medium">
                    {t("profiles:career.playlist", { defaultValue: "Playlist" })}
                  </th>
                  <th className="py-1.5 pr-3 font-medium">
                    {t("profiles:career.matches", { defaultValue: "Partidas" })}
                  </th>
                  <th className="py-1.5 pr-3 font-medium">
                    {t("profiles:career.wins", { defaultValue: "Ganadas" })}
                  </th>
                  <th className="py-1.5 font-medium">
                    {t("profiles:career.winRate", { defaultValue: "Win rate" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {insights.playlists.map((p) => (
                  <tr key={p.name} className="border-b border-border-subtle/60">
                    <td className="py-1.5 pr-3 text-text-primary">{p.name}</td>
                    <td className="py-1.5 pr-3 text-text-secondary">{p.played}</td>
                    <td className="py-1.5 pr-3 text-text-secondary">{p.won}</td>
                    <td
                      className={cn(
                        "py-1.5",
                        p.winRate >= 50 ? "text-accent-success" : "text-accent-danger",
                      )}
                    >
                      {Math.round(p.winRate)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* When you actually play well */}
      {insights?.byHour && insights.byHour.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-4 text-sm font-medium text-text-primary">
            {t("profiles:career.byHour", { defaultValue: "Tus mejores horarios" })}
          </h3>
          <HoursWheel data={insights.byHour} />
        </Card>
      )}
    </div>
  );
}
