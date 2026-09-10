import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTrainingAnalytics } from "@/hooks/useTrainingAnalytics";
import type { AnalyticsPeriod } from "@/lib/types";
import { Dumbbell, Clock, Repeat, Timer } from "lucide-react";

function formatDurationShort(totalSeconds: number, i18nLanguage: string): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return i18nLanguage.startsWith("es")
      ? `${hours} h ${minutes} min`
      : `${hours}h ${minutes}m`;
  }
  return i18nLanguage.startsWith("es")
    ? `${minutes} min`
    : `${minutes}m`;
}

export function TrainingTimeCard({ period }: { period: AnalyticsPeriod }) {
  const { t, i18n } = useTranslation(["analytics"]);
  const { data, isLoading, isError, refetch } = useTrainingAnalytics(period);

  if (period === "session") return null;

  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-lg" />;
  }

  if (isError) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-accent-danger">{t("analytics:panelError.message")}</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          {t("analytics:panelError.retry")}
        </Button>
      </Card>
    );
  }

  if (!data || (data.enabled === false && data.totalSessions === 0)) {
    return null;
  }

  const kpis = [
    {
      icon: Clock,
      label: t("analytics:training.totalTime"),
      value: formatDurationShort(data.totalSeconds, i18n.language),
    },
    {
      icon: Repeat,
      label: t("analytics:training.sessions"),
      value: String(data.totalSessions),
    },
    {
      icon: Timer,
      label: t("analytics:training.avgSession"),
      value: formatDurationShort(data.avgSessionSeconds, i18n.language),
    },
  ];

  return (
    <Card className="p-4" aria-label={t("analytics:training.title")}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-primary-subtle">
          <Dumbbell size={14} className="text-accent-primary" />
        </div>
        <h3 className="text-sm font-semibold text-text-primary">
          {t("analytics:training.title")}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {kpis.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-tertiary">
              <Icon size={11} />
              {label}
            </p>
            <p className="numeral mt-1 text-lg font-bold leading-none text-text-primary">
              {value}
            </p>
          </div>
        ))}
      </div>

      {data.days.length > 1 && (
        <div className="mt-3 flex h-10 items-end gap-1" aria-hidden="true">
          {data.days.slice(-14).map((day) => {
            const maxSeconds = Math.max(
              ...data.days.slice(-14).map((d) => d.totalSeconds),
              1,
            );
            return (
              <div
                key={day.date}
                title={`${day.date}: ${formatDurationShort(day.totalSeconds, i18n.language)}`}
                className="min-w-2 flex-1 rounded-sm bg-accent-primary/40 transition-colors hover:bg-accent-primary/70"
                style={{ height: `${Math.max((day.totalSeconds / maxSeconds) * 100, 6)}%` }}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}