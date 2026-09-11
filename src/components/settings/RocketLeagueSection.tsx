import { useState } from "react";
import { Controller } from "react-hook-form";
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { detectRlPath, inspectRlPath } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { FolderSearch, LoaderCircle, Plus, X } from "lucide-react";
import type { SettingsFormInput } from "@/lib/schemas";
import type { RlInstallation } from "@/lib/types";
import { inputClass } from "./inputClass";

function platformLabel(platform: string | null | undefined): string {
  if (platform === "steam") return "Steam";
  if (platform === "epic") return "Epic Games";
  return "—";
}

interface RocketLeagueSectionProps {
  register: UseFormRegister<SettingsFormInput>;
  control: Control<SettingsFormInput, unknown>;
  errors: FieldErrors<SettingsFormInput>;
  setValue: UseFormSetValue<SettingsFormInput>;
  rlPaths: string[];
  activePlatform: SettingsFormInput["activePlatform"];
}

export function RocketLeagueSection({
  register,
  control,
  errors,
  setValue,
  rlPaths,
  activePlatform,
}: RocketLeagueSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [isDetecting, setIsDetecting] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [isValidatingManual, setIsValidatingManual] = useState(false);

  const applyDetected = (results: RlInstallation[]) => {
    const valid = results.filter((r) => r.valid);
    const paths = valid.map((r) => r.path);
    if (paths.length > 0) {
      setValue("rlPaths", paths);
      setValue("rlPath", paths[0]);
      addToast({
        type: "success",
        title: t("settings:toasts.installFound.title"),
        message: t("settings:toasts.installFound.message", {
          platform: valid
            .map((r) => platformLabel(r.platform))
            .join(" + "),
          path: paths.join(", "),
        }),
      });
    } else {
      addToast({
        type: "warning",
        title: t("settings:toasts.notFound.title"),
        message: t("settings:toasts.notFound.message"),
      });
    }
  };

  const handleDetectPath = async () => {
    setIsDetecting(true);
    try {
      const results = await detectRlPath();
      applyDetected(results);
    } catch {
      addToast({
        type: "error",
        title: t("settings:toasts.detectError.title"),
        message: t("settings:toasts.detectError.message"),
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddManualPath = async () => {
    const path = manualPath.trim();
    if (!path) return;
    setIsValidatingManual(true);
    try {
      const detected = await inspectRlPath(path);
      const existing = rlPaths.some(
        (p) => p.toLowerCase() === detected.path.toLowerCase(),
      );
      if (!existing) {
        setValue("rlPaths", [...rlPaths, detected.path]);
      }
      setManualPath("");
      addToast({
        type: "success",
        title: t("settings:toasts.installFound.title"),
        message: t("settings:toasts.installFound.message", {
          platform: platformLabel(detected.platform),
          path: detected.path,
        }),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("settings:toasts.detectError.title"),
        message:
          error instanceof Error
            ? error.message
            : t("settings:toasts.detectError.message"),
      });
    } finally {
      setIsValidatingManual(false);
    }
  };

  return (
    <section className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
          <FolderSearch className="h-4 w-4 text-accent-primary" />
        </div>
        <h3 className="text-sm font-semibold tracking-wide text-text-secondary">
          {t("settings:sections.rocketLeague")}
        </h3>
      </div>
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">
            {t("settings:fields.playerName")}
          </label>
          <input
            type="text"
            {...register("playerName")}
            className={inputClass}
            placeholder={t("settings:fields.playerNamePlaceholder")}
            aria-label={t("settings:fields.playerName")}
          />
          {errors.playerName && (
            <p className="text-xs text-accent-danger">
              {errors.playerName.message}
            </p>
          )}
          <p className="text-xs text-text-muted">
            {t("settings:fields.playerNameHelper")}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-text-secondary">
              {t("settings:fields.installPath")}
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDetectPath}
              isLoading={isDetecting}
              disabled={isDetecting}
              className="shrink-0"
            >
              <FolderSearch size={14} className="mr-1" />
              {t("settings:fields.detectPath")}
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            {t("settings:fields.installPathsHelper")}
          </p>

          <div className="space-y-2">
            {rlPaths.length === 0 && (
              <p className="rounded-lg border border-dashed border-border-subtle bg-bg-base/60 px-3 py-3 text-xs text-text-muted">
                {t("settings:fields.noPaths")}
              </p>
            )}
            {rlPaths.map((path, index) => {
              const lower = path.toLowerCase();
              const isEpic = lower.includes("epic");
              const platform = isEpic ? "epic" : "steam";
              const isActive =
                activePlatform === "epic" || activePlatform === "steam"
                  ? activePlatform === platform
                  : false;
              return (
                <div
                  key={`${path}-${index}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-bg-base px-3 py-2",
                    isActive
                      ? "border-accent-success/40"
                      : "border-border-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      platform === "steam"
                        ? "bg-accent-info/15 text-accent-info"
                        : "bg-accent-primary/15 text-accent-primary",
                    )}
                  >
                    {platformLabel(platform)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-secondary">
                    {path}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-accent-success/15 px-2 py-0.5 text-[10px] font-bold text-accent-success">
                      {t("settings:fields.activePlatform")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = rlPaths.filter((_, i) => i !== index);
                      setValue("rlPaths", next);
                      if (next.length === 0) setValue("rlPath", null);
                    }}
                    className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-bg-surface hover:text-accent-danger"
                    aria-label={t("settings:fields.removePath")}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
              className={cn(inputClass, "flex-1")}
              placeholder={t("settings:fields.installPathPlaceholder")}
              aria-label={t("settings:fields.installPath")}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddManualPath}
              isLoading={isValidatingManual}
              disabled={isValidatingManual || !manualPath.trim()}
              className="shrink-0"
            >
              {isValidatingManual ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Plus size={14} className="mr-1" />
              )}
              {t("settings:fields.addPath")}
            </Button>
          </div>
          {errors.rlPaths && (
            <p className="text-xs text-accent-danger">
              {errors.rlPaths.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">
            {t("settings:fields.platform")}
          </label>
          <Controller
            name="platform"
            control={control}
            render={({ field }) => (
              <Select
                value={(field.value as string) || ""}
                onChange={(val) => field.onChange(val || null)}
                options={[
                  {
                    value: "",
                    label: String(t("settings:fields.platformAutoDetect")),
                  },
                  { value: "steam", label: "Steam" },
                  { value: "epic", label: "Epic Games" },
                ]}
                className="w-full"
              />
            )}
          />
          <p className="text-xs text-text-muted">
            {t("settings:fields.platformHelper")}
          </p>
          {errors.platform && (
            <p className="text-xs text-accent-danger">
              {errors.platform.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">
            {t("settings:fields.defaultMatchType")}
          </label>
          <div className="flex flex-wrap gap-2">
            {(["ranked", "casual", "tournament", "other"] as const).map(
              (type) => (
                <Controller
                  key={type}
                  name="defaultMatchType"
                  control={control}
                  render={({ field }) => (
                    <button
                      type="button"
                      onClick={() => field.onChange(type)}
                      className={cn(
                        "rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 active:scale-95",
                        field.value === type
                          ? "bg-accent-primary text-accent-primary-fg shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_30%,transparent)]"
                          : "bg-bg-base text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated border border-border-subtle",
                      )}
                    >
                      {t(`settings:matchTypes.${type}`)}
                    </button>
                  )}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
