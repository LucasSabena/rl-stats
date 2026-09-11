import { cn } from "@/lib/utils";
import type { FontScale } from "./fontScale";

export function SpeedBadge({ speed, fontScale }: { speed: number; fontScale: FontScale }) {
  const displaySpeed = Math.max(0, Math.round(speed));
  const isSupersonic = displaySpeed >= 82;
  const isFast = displaySpeed >= 50;

  return (
    <div className={cn(
      "ml-2 flex items-center gap-1 rounded px-2 py-0.5 font-mono font-bold tabular-nums border",
      fontScale.mmr,
      isSupersonic ? "bg-accent-warning/10 text-accent-warning border-accent-warning/20" :
      isFast ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20" :
      "bg-white/5 text-text-secondary border-white/10"
    )}>
      <span>{displaySpeed}</span>
    </div>
  );
}
