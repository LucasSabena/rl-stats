import { cn } from "@/lib/utils";
import type { FontScale } from "./fontScale";

export function MmrBadge({ mmr, fontScale }: { mmr: number; fontScale: FontScale }) {
  const isHigh = mmr > 1500;
  const isMid = mmr > 1000;

  return (
    <div className={cn(
      "ml-2 flex items-center justify-center rounded px-2 py-0.5 font-mono font-bold tabular-nums border",
      fontScale.mmr,
      isHigh ? "bg-accent-success/10 text-accent-success border-accent-success/20" :
      isMid ? "bg-accent-warning/10 text-accent-warning border-accent-warning/20" :
      "bg-white/5 text-text-secondary border-white/10"
    )}>
      {mmr}
    </div>
  );
}
