import { useTranslation } from "react-i18next";
import { CreditCard, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CloudSession } from "@/lib/cloudClient";
import { inputClass } from "./inputClass";

interface CloudAccountSectionProps {
  session: CloudSession | null;
  email: string;
  password: string;
  authMode: "sign-in" | "sign-up";
  busyAction: string | null;
  planStatusLabel: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleAuthMode: () => void;
  onAuth: () => void;
  onSignOut: () => void;
  onOpenPortal: () => void;
}

export function CloudAccountSection({
  session,
  email,
  password,
  authMode,
  busyAction,
  planStatusLabel,
  onEmailChange,
  onPasswordChange,
  onToggleAuthMode,
  onAuth,
  onSignOut,
  onOpenPortal,
}: CloudAccountSectionProps) {
  const { t } = useTranslation("settings");

  if (!session) {
    return (
      <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <UserRound className="h-4 w-4 text-accent-primary" />
          <h4 className="text-sm font-semibold text-text-secondary">
            {t("cloud.account")}
          </h4>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder={t("cloud.emailPlaceholder")}
            aria-label={t("cloud.emailLabel")}
          />
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={t("cloud.passwordPlaceholder")}
            aria-label={t("cloud.passwordLabel")}
          />
          <Button
            type="button"
            isLoading={busyAction === "auth"}
            onClick={onAuth}
          >
            {authMode === "sign-in"
              ? t("cloud.signIn")
              : t("cloud.createAccount")}
          </Button>
        </div>
        <button
          type="button"
          className="mt-3 text-xs text-accent-primary hover:underline"
          onClick={onToggleAuthMode}
        >
          {authMode === "sign-in"
            ? t("cloud.needAccount")
            : t("cloud.haveAccount")}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {t("cloud.signedInAs", {
              email: session.user.email ?? session.user.id,
            })}
          </p>
          <p className="text-xs text-text-tertiary">
            {t("cloud.subscription", { status: planStatusLabel })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={CreditCard}
            onClick={onOpenPortal}
            isLoading={busyAction === "portal"}
          >
            {t("cloud.manageBilling")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={LogOut}
            onClick={onSignOut}
            isLoading={busyAction === "sign-out"}
          >
            {t("cloud.signOut")}
          </Button>
        </div>
      </div>
    </section>
  );
}
