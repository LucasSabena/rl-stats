import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useKickoffBackfill } from "@/hooks/useAnalytics";

export function KickoffRecountButton() {
  const { t } = useTranslation(['analytics']);
  const recount = useKickoffBackfill();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => recount.mutate()}
        disabled={recount.isPending}
      >
        {recount.isPending
          ? t('analytics:kickoff.recounting')
          : t('analytics:kickoff.recount')}
      </Button>
      {recount.isSuccess && (
        <span className="text-xs text-text-secondary">
          {t('analytics:kickoff.recountDone', {
            found: recount.data.kickoffFound,
            updated: recount.data.matchesUpdated,
          })}
        </span>
      )}
      {recount.isError && (
        <span className="text-xs text-accent-danger">{t('analytics:kickoff.recountError')}</span>
      )}
    </div>
  );
}
