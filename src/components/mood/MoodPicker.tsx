import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MOODS, moodIcon, moodTone, type MoodKey } from "@/lib/moods";

interface MoodPickerProps {
  value: string | null;
  onChange: (mood: MoodKey) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

/**
 * Five-face mood selector (very happy → very angry).
 * Used by the post-match modal, the history edit dialog and match detail.
 */
export function MoodPicker({ value, onChange, size = "md", disabled = false }: MoodPickerProps) {
  const { t } = useTranslation(["mood"]);

  const dims =
    size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const iconSize = size === "lg" ? 34 : size === "sm" ? 18 : 24;

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2" role="radiogroup" aria-label={t("mood:pickerLabel")}>
      {MOODS.map((mood) => {
        const Icon = moodIcon(mood);
        const selected = value === mood;
        return (
          <button
            key={mood}
            type="button"
            role="radio"
            aria-checked={selected}
            title={t(`mood:options.${mood}`)}
            aria-label={t(`mood:options.${mood}`)}
            disabled={disabled}
            onClick={() => onChange(mood)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border p-1.5 transition-all sm:p-2",
              dims,
              "justify-center",
              selected
                ? "scale-105 border-accent-primary bg-accent-primary/10 shadow-level-1"
                : "border-border-subtle bg-bg-panel hover:scale-[1.03] hover:border-border-default hover:bg-bg-hover",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <Icon
              size={iconSize}
              className={cn(moodTone(mood), !selected && "opacity-70")}
            />
            <span
              className={cn(
                "text-[9px] font-medium leading-none sm:text-[10px]",
                selected ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {t(`mood:options.${mood}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
