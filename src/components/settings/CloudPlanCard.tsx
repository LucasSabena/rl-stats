import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface CloudPlanCardProps {
  title: string;
  price: string;
  description: string;
  action: string;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}

export function CloudPlanCard({
  title,
  price,
  description,
  action,
  active,
  loading,
  onClick,
}: CloudPlanCardProps) {
  const { t } = useTranslation("settings");
  return (
    <div
      className={cn(
        "rounded-xl border bg-bg-surface/60 p-5 transition-all",
        active
          ? "border-accent-success/40 shadow-[0_0_24px_rgba(16,185,129,0.12)]"
          : "border-border-subtle hover:border-border-default",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-primary">{price}</p>
        </div>
        {active && (
          <Badge variant="success">{t("cloud.badges.active")}</Badge>
        )}
      </div>
      <p className="mb-5 text-sm text-text-tertiary">{description}</p>
      <Button
        type="button"
        variant={active ? "secondary" : "primary"}
        size="sm"
        isLoading={loading}
        onClick={onClick}
        disabled={active}
      >
        {active ? t("cloud.plans.current") : action}
      </Button>
    </div>
  );
}
