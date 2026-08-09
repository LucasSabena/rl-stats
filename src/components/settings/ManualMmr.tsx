import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { setLocalMmr } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { Gauge } from "lucide-react";

const PLAYLISTS = [
  "duel",
  "doubles",
  "standard",
  "hoops",
  "rumble",
  "dropshot",
  "snowday",
  "quads",
] as const;

export function ManualMmr() {
  const { t } = useTranslation(["settings", "common"]);
  const { data: settings } = useSettings();
  const addToast = useUIStore((state) => state.addToast);
  const [playlist, setPlaylist] = useState<string>("standard");
  const [mmr, setMmr] = useState<string>("");

  const hasProfile = Boolean(settings?.localPrimaryId);

  const mutation = useMutation({
    mutationFn: () => setLocalMmr(playlist, Number(mmr)),
    onSuccess: () => {
      addToast({
        type: "success",
        title: t("settings:manualMmr.saved"),
        message: t("settings:manualMmr.savedMessage", {
          playlist: t(`settings:playlistNames.${playlist}`),
          mmr,
        }),
      });
      setMmr("");
    },
    onError: (err: Error) =>
      addToast({
        type: "error",
        title: t("settings:manualMmr.error"),
        message: err.message || t("settings:manualMmr.errorMessage"),
      }),
  });

  const mmrNum = Number(mmr);
  const valid = Number.isFinite(mmrNum) && mmrNum >= 0 && mmrNum <= 3000;

  return (
    <section className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
          <Gauge className="h-4 w-4 text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-text-secondary">
            {t("settings:manualMmr.title")}
          </h3>
          <p className="text-xs text-text-muted">
            {t("settings:manualMmr.description")}
          </p>
        </div>
      </div>

      {!hasProfile ? (
        <p className="text-xs text-accent-warning">
          {t("settings:manualMmr.noProfile")}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-40 flex-1 flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-secondary">
              {t("settings:manualMmr.playlist")}
            </label>
            <Select
              value={playlist}
              onChange={setPlaylist}
              options={PLAYLISTS.map((key) => ({
                value: key,
                label: t(`settings:playlistNames.${key}`),
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-secondary">
              {t("settings:manualMmr.mmr")}
            </label>
            <input
              type="number"
              min={0}
              max={3000}
              value={mmr}
              onChange={(e) => setMmr(e.target.value)}
              placeholder="1363"
              className={cn(
                "h-9 w-28 rounded-md border border-border-default bg-bg-surface px-2.5 text-sm text-text-primary",
                "placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
              )}
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!valid}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("settings:manualMmr.save")}
          </Button>
        </div>
      )}
    </section>
  );
}
