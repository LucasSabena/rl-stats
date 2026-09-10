import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PackCategory } from "@/lib/trainingPacksTypes";
import {
  Zap,
  Plane,
  Gamepad2,
  Target,
  Shield,
  Flame,
  Volleyball,
  Hexagon,
  Crosshair,
  Gem,
} from "lucide-react";

const CATEGORIES: { key: PackCategory; icon: React.ElementType }[] = [
  { key: "speedflip", icon: Zap },
  { key: "aerial", icon: Plane },
  { key: "dribbling", icon: Gamepad2 },
  { key: "shooting", icon: Target },
  { key: "kickoff", icon: Flame },
  { key: "wall-ceiling", icon: Hexagon },
  { key: "goalie", icon: Shield },
  { key: "defense", icon: Crosshair },
  { key: "powershot", icon: Volleyball },
  { key: "freestyle", icon: Gem },
];

interface CategoryFilterProps {
  activeCategory: string | null;
  onCategoryChange: (c: string | null) => void;
}

export function CategoryFilter({
  activeCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  const { t } = useTranslation("trainingPacks");

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onCategoryChange(null)}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
          activeCategory === null
            ? "bg-accent-primary text-accent-primary-fg shadow-md shadow-accent-primary/20"
            : "bg-bg-panel text-text-secondary border border-border-subtle hover:bg-bg-hover hover:text-text-primary"
        )}
      >
        {t("categories.all")}
      </button>

      {CATEGORIES.map(({ key, icon: Icon }) => {
        const isActive = activeCategory === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCategoryChange(isActive ? null : key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              isActive
                ? "bg-accent-primary text-accent-primary-fg shadow-md shadow-accent-primary/20"
                : "bg-bg-panel text-text-secondary border border-border-subtle hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <Icon size={14} />
            {t(`categories.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
