import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface TourCardProps {
  onStart: () => void;
}

export function TourCard({ onStart }: TourCardProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-accent-primary/20 bg-accent-primary-subtle px-4 py-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Sparkles size={15} className="text-accent-primary" />
          {t("settings:tour.title")}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {t("settings:tour.description")}
        </p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onStart}>
        {t("settings:tour.start")}
      </Button>
    </div>
  );
}
