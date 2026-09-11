import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Target, Pencil, Check } from "lucide-react";

interface WeeklyGoalCardProps {
  /** Matches played in the current (week) period. */
  matches: number;
  /** Wins in the current (week) period. */
  wins: number;
}

function GoalBar({
  label,
  current,
  goal,
}: {
  label: string;
  current: number;
  goal: number;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const done = goal > 0 && current >= goal;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className={cn("font-mono", done ? "text-accent-success" : "text-text-primary")}>
          {current} / {goal}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-base">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            done ? "bg-accent-success" : "bg-accent-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Weekly play/win goals with progress against the current week. */
export function WeeklyGoalCard({ matches, wins }: WeeklyGoalCardProps) {
  const { t } = useTranslation(["analytics", "common"]);
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const goalMatches = settings?.weeklyGoalMatches ?? 0;
  const goalWins = settings?.weeklyGoalWins ?? 0;
  const hasGoals = goalMatches > 0 || goalWins > 0;

  const [editing, setEditing] = useState(false);
  const [draftMatches, setDraftMatches] = useState(goalMatches);
  const [draftWins, setDraftWins] = useState(goalWins);

  useEffect(() => {
    if (!editing) {
      setDraftMatches(goalMatches);
      setDraftWins(goalWins);
    }
  }, [editing, goalMatches, goalWins]);

  async function save() {
    if (!settings) return;
    await updateSettings.mutateAsync({
      ...settings,
      weeklyGoalMatches: Math.max(0, Math.min(200, draftMatches)),
      weeklyGoalWins: Math.max(0, Math.min(200, draftWins)),
    });
    setEditing(false);
  }

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t("analytics:weeklyGoals.title")}
          </h3>
        </div>
        {hasGoals && !editing && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Pencil}
            onClick={() => setEditing(true)}
          >
            {t("common:buttons.edit")}
          </Button>
        )}
      </div>

      {editing || !hasGoals ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-text-muted">
            {t("analytics:weeklyGoals.description")}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-[11px] text-text-muted">
              {t("analytics:weeklyGoals.matchesGoal")}
              <input
                type="text"
                inputMode="numeric"
                aria-label={t("analytics:weeklyGoals.matchesGoal")}
                value={draftMatches}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setDraftMatches(raw === "" ? 0 : Number(raw));
                }}
                className="block w-20 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-center text-sm text-text-primary focus:border-accent-primary focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-[11px] text-text-muted">
              {t("analytics:weeklyGoals.winsGoal")}
              <input
                type="text"
                inputMode="numeric"
                aria-label={t("analytics:weeklyGoals.winsGoal")}
                value={draftWins}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setDraftWins(raw === "" ? 0 : Number(raw));
                }}
                className="block w-20 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-center text-sm text-text-primary focus:border-accent-primary focus:outline-none"
              />
            </label>
            <Button
              size="sm"
              variant="primary"
              leftIcon={Check}
              onClick={() => void save()}
              isLoading={updateSettings.isPending}
            >
              {t("analytics:weeklyGoals.save")}
            </Button>
            {hasGoals && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t("common:buttons.cancel")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {goalMatches > 0 && (
            <GoalBar
              label={t("analytics:weeklyGoals.matchesProgress")}
              current={matches}
              goal={goalMatches}
            />
          )}
          {goalWins > 0 && (
            <GoalBar
              label={t("analytics:weeklyGoals.winsProgress")}
              current={wins}
              goal={goalWins}
            />
          )}
        </div>
      )}
    </section>
  );
}
