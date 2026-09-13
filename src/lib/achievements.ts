import {
  CalendarCheck,
  Crosshair,
  Flame,
  Gauge,
  Medal,
  Shield,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CareerRecords } from "@/lib/types";

export type AchievementCategory =
  | "matches"
  | "offense"
  | "defense"
  | "streaks"
  | "special";

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  icon: LucideIcon;
  /** Value that must be reached. */
  target: number;
  /** Absolute progress value for a records snapshot. */
  value: (records: CareerRecords) => number;
  /** Optional display formatter for the current value. */
  format?: (value: number) => string;
}

const hours = (seconds: number) => Math.floor(seconds / 3600);

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_match",
    category: "matches",
    icon: Sparkles,
    target: 1,
    value: (r) => r.totalMatches,
  },
  {
    id: "matches_100",
    category: "matches",
    icon: CalendarCheck,
    target: 100,
    value: (r) => r.totalMatches,
  },
  {
    id: "matches_1000",
    category: "matches",
    icon: Medal,
    target: 1000,
    value: (r) => r.totalMatches,
  },
  {
    id: "goals_100",
    category: "offense",
    icon: Target,
    target: 100,
    value: (r) => r.totalGoals,
  },
  {
    id: "goals_1000",
    category: "offense",
    icon: Crosshair,
    target: 1000,
    value: (r) => r.totalGoals,
  },
  {
    id: "assists_500",
    category: "offense",
    icon: Zap,
    target: 500,
    value: (r) => r.totalAssists,
  },
  {
    id: "saves_500",
    category: "defense",
    icon: Shield,
    target: 500,
    value: (r) => r.totalSaves,
  },
  {
    id: "demos_500",
    category: "defense",
    icon: Flame,
    target: 500,
    value: (r) => r.totalDemos,
  },
  {
    id: "hat_tricks_25",
    category: "offense",
    icon: Trophy,
    target: 25,
    value: (r) => r.hatTricks,
  },
  {
    id: "streak_10",
    category: "streaks",
    icon: Swords,
    target: 10,
    value: (r) => r.bestStreak,
  },
  {
    id: "ot_wins_50",
    category: "streaks",
    icon: Timer,
    target: 50,
    value: (r) => r.overtimeWins,
  },
  {
    id: "speed_2100",
    category: "special",
    icon: Gauge,
    target: 2100,
    value: (r) => Math.round(r.peakSpeed),
  },
  {
    id: "playtime_100h",
    category: "special",
    icon: Timer,
    target: 100,
    value: (r) => hours(r.playtimeSeconds),
  },
];

export interface AchievementStatus {
  def: AchievementDef;
  current: number;
  unlocked: boolean;
  progress: number;
}

export function evaluateAchievements(records: CareerRecords): AchievementStatus[] {
  return ACHIEVEMENTS.map((def) => {
    const current = Math.max(0, def.value(records));
    return {
      def,
      current,
      unlocked: current >= def.target,
      progress: def.target > 0 ? Math.min(1, current / def.target) : 1,
    };
  });
}
