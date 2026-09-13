import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ChatPanel } from "@/components/broadcast/ChatPanel";
import { GameToolsPanel } from "@/components/broadcast/GameToolsPanel";
import { ObsPanel } from "@/components/broadcast/ObsPanel";
import { RundownPanel } from "@/components/broadcast/RundownPanel";
import { ScenePanel } from "@/components/broadcast/ScenePanel";
import { SeriesPanel } from "@/components/broadcast/SeriesPanel";
import { ServerPanel } from "@/components/broadcast/ServerPanel";
import { StateBar } from "@/components/broadcast/StateBar";
import { TeamsPanel } from "@/components/broadcast/TeamsPanel";
import { useBroadcastFeed } from "@/hooks/useBroadcastFeed";
import { useObsController } from "@/hooks/useObsController";
import {
  getOverlayServerStatus,
  getSeriesState,
  listTeams,
} from "@/lib/api";
import type {
  BroadcastTeam,
  OverlayServerStatus,
  SeriesSnapshot,
} from "@/lib/types";
import { Radio, Wifi, WifiOff } from "lucide-react";

const TABS = ["control", "scene", "teams", "chat", "server"] as const;

/**
 * Broadcast Studio Control Room.
 *
 * One surface to run a stream or a tournament: state machine, series, rundown,
 * scene/pack editor, team library, read-only chat and the OBS server.
 */
export function BroadcastPage() {
  const { t } = useTranslation(["overlay", "common"]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("control");
  const [status, setStatus] = useState<OverlayServerStatus | undefined>();
  const [teams, setTeams] = useState<BroadcastTeam[]>([]);
  const [series, setSeries] = useState<SeriesSnapshot | null>(null);
  const feed = useBroadcastFeed(status);
  const obs = useObsController(feed.activeState);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getOverlayServerStatus());
    } catch {
      setStatus(undefined);
    }
  }, []);

  const refreshData = useCallback(async () => {
    const [teamList, seriesState] = await Promise.all([
      listTeams(),
      getSeriesState(),
    ]);
    setTeams(teamList);
    setSeries(seriesState);
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshData();
  }, [refreshStatus, refreshData]);

  useEffect(() => {
    if (feed.series) setSeries(feed.series);
  }, [feed.series]);

  return (
    <PageContainer>
      <div className="space-y-5 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-text-primary">
              <Radio className="h-6 w-6 text-accent-primary" aria-hidden />
              {t("overlay:broadcast.title")}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {t("overlay:broadcast.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={feed.activeState === "live" ? "live" : "default"}>
              {t(`overlay:broadcast.states.${feed.activeState}`)}
            </Badge>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
              {feed.connected ? (
                <Wifi className="h-3.5 w-3.5 text-accent-success" aria-hidden />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-text-tertiary" aria-hidden />
              )}
              {feed.connected
                ? t("overlay:broadcast.server.connected")
                : t("overlay:broadcast.server.disconnected")}
            </span>
            {series?.available && (
              <span className="font-mono text-xs text-text-secondary">
                {series.teamA?.tag ?? "A"} {series.scoreA} – {series.scoreB}{" "}
                {series.teamB?.tag ?? "B"}
              </span>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList>
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`overlay:broadcast.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="control" className="mt-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <StateBar feed={feed} />
                <SeriesPanel
                  series={series}
                  teams={teams}
                  port={status?.port ?? 9528}
                  onRefresh={() => void refreshData()}
                />
                <GameToolsPanel />
              </div>
              <div className="space-y-4">
                <RundownPanel scene={feed.scene} />
                {feed.match && (
                  <div className="rounded-lg border border-border-subtle bg-bg-panel p-3 text-xs text-text-secondary">
                    <p className="font-mono">
                      {feed.match.scoreBlue ?? 0} – {feed.match.scoreOrange ?? 0} ·{" "}
                      {feed.match.isOvertime ? "OT" : ""}
                    </p>
                    <p className="mt-1 text-text-muted">
                      {feed.match.arena ?? "—"} · {feed.match.playerCount ?? 0}{" "}
                      jugadores
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scene" className="mt-4">
            <ScenePanel
              port={status?.port ?? 9528}
              token={status?.token ?? ""}
              serverRunning={Boolean(status?.running)}
            />
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <TeamsPanel
              port={status?.port ?? 9528}
              onChanged={() => void refreshData()}
            />
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            <ChatPanel messages={feed.chat} connected={feed.connected} />
          </TabsContent>

          <TabsContent value="server" className="mt-4">
            <div className="space-y-4">
              <ObsPanel obs={obs} />
              <ServerPanel status={status} onStatusChange={() => void refreshStatus()} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
