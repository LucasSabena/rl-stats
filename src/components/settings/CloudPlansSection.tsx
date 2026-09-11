import { useTranslation } from "react-i18next";
import type {
  CloudPlanCode,
  CloudSubscription,
} from "@/lib/cloudClient";
import { CloudPlanCard } from "./CloudPlanCard";

interface CloudPlansSectionProps {
  subscription: CloudSubscription | null;
  busyAction: string | null;
  onCheckout: (planCode: CloudPlanCode) => void;
}

export function CloudPlansSection({
  subscription,
  busyAction,
  onCheckout,
}: CloudPlansSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <CloudPlanCard
        title={t("cloud.plans.basic")}
        price={t("cloud.plans.basicPrice")}
        description={t("cloud.plans.basicDescription")}
        action={t("cloud.plans.chooseBasic")}
        active={subscription?.plan_code === "cloud_basic"}
        loading={busyAction === "cloud_basic"}
        onClick={() => onCheckout("cloud_basic")}
      />
      <CloudPlanCard
        title={t("cloud.plans.supporter")}
        price={t("cloud.plans.supporterPrice")}
        description={t("cloud.plans.supporterDescription")}
        action={t("cloud.plans.chooseSupporter")}
        active={subscription?.plan_code === "cloud_supporter"}
        loading={busyAction === "cloud_supporter"}
        onClick={() => onCheckout("cloud_supporter")}
      />
    </section>
  );
}
