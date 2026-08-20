import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { configureRlIniAll } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/stores/uiStore";
import { useSettings } from "@/hooks/useSettings";
import { FileJson } from "lucide-react";
import { cn } from "@/lib/utils";
import { iniSettingsSchema, type IniSettingsFormValues } from "@/lib/schemas";

export function IniHelper() {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const { data: settings } = useSettings();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IniSettingsFormValues>({
    resolver: zodResolver(iniSettingsSchema),
    defaultValues: {
      port: 49123,
      enabled: true,
    },
  });

  const onSubmit = async (data: IniSettingsFormValues) => {
    try {
      const paths = settings?.rlPaths?.length
        ? settings.rlPaths
        : settings?.rlPath
          ? [settings.rlPath]
          : [];
      if (paths.length === 0) {
        throw new Error(t("settings:ini.errors.noRlPath"));
      }

      await configureRlIniAll(paths, data.port);
      addToast({
        type: "success",
        title: t("settings:ini.toasts.applied.title"),
        message: t("settings:ini.toasts.applied.message", {
          port: data.port,
          count: paths.length,
        }),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings:ini.toasts.error.message");
      addToast({ type: "error", title: t("common:errors.title"), message });
    }
  };

  const inputClass = cn(
    "w-full rounded-lg border bg-bg-base px-3.5 py-2.5 text-sm text-text-primary transition-all duration-200",
    "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
    "hover:border-border-highlight"
  );

  const errorClass = "mt-1 text-xs text-accent-danger";

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-info/10 text-accent-info transition-colors group-hover:bg-accent-info/15">
            <FileJson size={20} />
          </div>
          <div className="flex-1 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {t("settings:ini.title")}
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                {t("settings:ini.description")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="ini-port"
                  className="text-xs font-medium text-text-secondary"
                >
                  {t("settings:ini.port")}
                </label>
                <input
                  id="ini-port"
                  type="number"
                  min={1}
                  max={65535}
                  {...register("port", { valueAsNumber: true })}
                  className={inputClass}
                />
                {errors.port && (
                  <p className={errorClass}>{errors.port.message}</p>
                )}
              </div>

              <div className="flex items-end">
                <label
                  htmlFor="ini-enabled"
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-2.5 transition-all duration-200 hover:border-border-default"
                >
                  <input
                    id="ini-enabled"
                    type="checkbox"
                    {...register("enabled")}
                    className="h-4 w-4 rounded border-border-highlight bg-bg-surface accent-accent-primary transition-colors"
                  />
                  <span className="text-sm text-text-secondary">
                    {t("settings:ini.enable")}
                  </span>
                </label>
              </div>
            </div>

            <Button
              type="submit"
              variant="secondary"
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              <FileJson size={14} className="mr-1.5" />
              {t("settings:ini.configureButton")}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}