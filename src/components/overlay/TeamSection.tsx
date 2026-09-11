import { memo } from "react";
import type { Player, OverlayDisplaySettings } from "@/lib/types";
import type { FontScale } from "./fontScale";
import { OverlayPlayerRow } from "./OverlayPlayerRow";

export const TeamSection = memo(function TeamSection({
  players,
  display,
  mmrMap,
  mmrErrorMap,
  fontScale,
  team,
}: {
  players: Player[];
  display: OverlayDisplaySettings;
  mmrMap: Record<string, number | null>;
  mmrErrorMap: Record<string, string>;
  fontScale: FontScale;
  team: number;
}) {
  const isBlue = team === 0;

  return (
    <div className="flex flex-col gap-px px-1.5 py-1">
      
      {players.map((p) => (
        <OverlayPlayerRow
          key={p.id}
          player={p}
          display={display}
          mmr={mmrMap[p.id] ?? null}
          mmrError={mmrErrorMap[p.id] ?? null}
          fontScale={fontScale}
          isBlue={isBlue}
        />
      ))}
    </div>
  );
});
