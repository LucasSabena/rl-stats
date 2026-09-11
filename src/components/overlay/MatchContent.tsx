import { useTranslation } from "react-i18next";
import { useLiveStore } from "@/stores/liveStore";
import { cn, formatDuration } from "@/lib/utils";
import { getArenaDisplayName } from "@/lib/arenaMap";
import type { Player, OverlayDisplaySettings } from "@/lib/types";
import type { FontScale } from "./fontScale";
import { TeamSection } from "./TeamSection";

interface MatchContentProps {
  match: NonNullable<ReturnType<typeof useLiveStore.getState>["currentMatch"]>;
  connectionStatus: string;
  display: OverlayDisplaySettings;
  fontScale: FontScale;
  mmrMap: Record<string, number | null>;
  mmrErrorMap: Record<string, string>;
}

export function MatchContent({ match, connectionStatus, display, fontScale, mmrMap, mmrErrorMap }: MatchContentProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const localTeam = identifyLocalTeam(match.players);
  const allPlayers = match.players;
  const visiblePlayers = display.playerScope === "team" && localTeam !== null
    ? allPlayers.filter((p: Player) => p.team === localTeam)
    : allPlayers;

  const bluePlayers = visiblePlayers.filter((p: Player) => p.team === 0).sort((a, b) => b.score - a.score);
  const orangePlayers = visiblePlayers.filter((p: Player) => p.team === 1).sort((a, b) => b.score - a.score);
  const showBothTeams = bluePlayers.length > 0 && orangePlayers.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* ── Widget Panel ── */}
      <div className="flex flex-col overflow-hidden rounded-md border border-white/10 bg-black/55 backdrop-blur-md">
        
        {/* TOP BAR: Score & Timer */}
        {(display.showScore || display.showTimer) && (
          <div className="relative flex flex-col items-center px-3 pb-1.5 pt-2">
            
            {/* Arena Name (Absolute Top) */}
            {display.showTimer && match.gameState.arena && (
              <div className="absolute top-1 right-3 flex items-center gap-1.5">
                <span className={cn("text-white/45", fontScale.arena)}>
                  {getArenaDisplayName(match.gameState.arena)}
                </span>
                <span className={cn("h-1.5 w-1.5 rounded-full shadow-sm", connectionStatus === "connected" ? "bg-accent-success" : "bg-accent-warning")} />
              </div>
            )}

            {/* Score & Timer Layout */}
            <div className="flex items-center justify-center gap-6 w-full">
              {display.showScore && (
                <div className="flex-1 flex justify-end">
                  <span className={cn(
                    "font-semibold tabular-nums",
                    fontScale.score,
                    match.teamBlueScore > match.teamOrangeScore ? "text-team-blue" : "text-white"
                  )}>
                    {match.teamBlueScore}
                  </span>
                </div>
              )}
              
              {display.showTimer && (
                <div className="flex shrink-0 flex-col items-center justify-center px-3">
                  <span className={cn(
                    "font-mono tabular-nums",
                    fontScale.timer,
                    match.gameState.isOvertime ? "text-accent-warning animate-overtime" : "text-white"
                  )}>
                    {match.gameState.isOvertime ? `+${formatDuration(match.gameState.timeRemaining)}` : formatDuration(match.gameState.timeRemaining)}
                  </span>
                  {match.gameState.isOvertime && <span className="mt-0.5 text-[10px] text-accent-warning">{t("overlay:labels.overtime")}</span>}
                </div>
              )}

              {display.showScore && (
                <div className="flex-1 flex justify-start">
                  <span className={cn(
                    "font-semibold tabular-nums",
                    fontScale.score,
                    match.teamOrangeScore > match.teamBlueScore ? "text-team-orange" : "text-white"
                  )}>
                    {match.teamOrangeScore}
                  </span>
                </div>
              )}
            </div>
            
            <div className="absolute bottom-0 left-0 h-px w-full bg-white/8" />
          </div>
        )}

        {/* PLAYERS */}
        {display.showPlayers && (
          <div className="flex flex-col">
            {bluePlayers.length > 0 && (
              <TeamSection
                players={bluePlayers}
                display={display}
                mmrMap={mmrMap}
                mmrErrorMap={mmrErrorMap}
                fontScale={fontScale}
                team={0}
              />
            )}
            
            {showBothTeams && (
              <div className="mx-2 h-px bg-white/8" />
            )}
            
            {orangePlayers.length > 0 && (
              <TeamSection
                players={orangePlayers}
                display={display}
                mmrMap={mmrMap}
                mmrErrorMap={mmrErrorMap}
                fontScale={fontScale}
                team={1}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Team Identification ────────────────────────────────────────────────────

function identifyLocalTeam(players: Player[]): number | null {
  if (players.length >= 4) return null;
  if (players.length === 0) return null;

  const teams = new Set(players.map((p) => p.team));
  if (teams.size === 1) return players[0]?.team ?? null;

  return null;
}
