import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePromptNav } from "@/hooks/usePromptNav";
import { useSetMatchMood } from "@/hooks/useSetMatchMood";
import { MOODS, moodIcon, moodTone, type MoodKey } from "@/lib/moods";
import { cn } from "@/lib/utils";

interface MoodPromptProps {
  matchId: number;
  timeoutSecs: number;
  onDone: () => void;
}

/**
 * Post-match mood prompt for the focus window: five big faces navigable
 * with gamepad, keyboard and mouse at the same time (last input wins).
 * Saving hides the window; any dismiss path hides it without saving.
 */
export function MoodPrompt({ matchId, timeoutSecs, onDone }: MoodPromptProps) {
  const { t } = useTranslation(["mood", "prompt"]);
  const moodMutation = useSetMatchMood();
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(timeoutSecs);

  const save = useCallback(
    (mood: MoodKey) => {
      setError(null);
      moodMutation.mutate(
        { matchId, mood },
        {
          onSuccess: () => onDone(),
          onError: (e) => {
            setError(e instanceof Error ? e.message : String(e));
          },
        },
      );
    },
    [matchId, moodMutation, onDone],
  );

  const { index, setIndex, accept } = usePromptNav({
    count: MOODS.length,
    onAccept: (i) => save(MOODS[i]),
    onDismiss: onDone,
    disabled: moodMutation.isPending,
  });

  // Auto-dismiss without saving when the timeout expires. The interval also
  // drives the visible countdown.
  useEffect(() => {
    if (timeoutSecs <= 0) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, timeoutSecs - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        onDone();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [timeoutSecs, onDone]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border-highlight bg-bg-elevated/95 p-6 shadow-level-3 backdrop-blur">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-text-primary">
            {t("mood:modal.title")}
          </h2>
          <span
            className="shrink-0 font-mono text-xs text-text-tertiary"
            aria-label={t("prompt:timeout", { count: remaining })}
          >
            {remaining}s
          </span>
        </div>
        <p className="mb-5 text-sm text-text-secondary">{t("mood:modal.description")}</p>

        <div className="flex items-stretch justify-center gap-2 sm:gap-3" role="radiogroup" aria-label={t("mood:pickerLabel")}>
          {MOODS.map((mood, i) => {
            const Icon = moodIcon(mood);
            const selected = index === i;
            return (
              <button
                key={mood}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(`mood:options.${mood}`)}
                title={t(`mood:options.${mood}`)}
                disabled={moodMutation.isPending}
                onMouseEnter={() => setIndex(i)}
                onFocus={() => setIndex(i)}
                onClick={() => {
                  setIndex(i);
                  accept();
                }}
                className={cn(
                  "flex h-24 w-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 transition-all sm:h-28 sm:w-24",
                  selected
                    ? "scale-110 border-accent-primary bg-accent-primary/15 shadow-level-2"
                    : "border-border-subtle bg-bg-panel opacity-70 hover:scale-105 hover:opacity-100",
                  moodMutation.isPending && "cursor-wait",
                )}
              >
                <Icon size={40} className={moodTone(mood)} />
                <span
                  className={cn(
                    "text-[11px] font-semibold leading-none sm:text-xs",
                    selected ? "text-text-primary" : "text-text-tertiary",
                  )}
                >
                  {t(`mood:options.${mood}`)}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 text-center text-xs text-accent-danger">
            {t("mood:modal.error")} {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
          <span>{t("prompt:hints.gamepad")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("prompt:hints.keyboard")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("prompt:hints.mouse")}</span>
        </div>
      </div>
    </div>
  );
}
