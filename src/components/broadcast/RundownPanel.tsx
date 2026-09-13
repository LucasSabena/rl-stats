import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { setGraphicVisibility } from "@/lib/api";
import type { ScenePayload } from "@/hooks/useBroadcastFeed";
import { Eye, EyeOff } from "lucide-react";

const MODULE_LABELS: Record<string, string> = {
  scorebug: "Marcador",
  series: "Serie",
  roster: "Roster",
  events: "Eventos",
  chat: "Chat",
  brand: "Logo",
  countdown: "Countdown",
  timer: "Timer",
  socials: "Sociales",
  sponsors: "Sponsors",
  replaybadge: "Replay",
  upnext: "Próximo",
  focus: "En cámara",
  mvp: "MVP",
  info: "Info",
};

interface RundownPanelProps {
  scene: ScenePayload | null;
}

/** TAKE/OUT switches for every module in the active scene. */
export function RundownPanel({ scene }: RundownPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHidden({});
  }, [scene?.scene?.id, scene?.state]);

  const layout = scene?.layout ?? {};
  const keys = Object.keys(layout);

  const toggle = async (key: string) => {
    const next = !hidden[key];
    setHidden((current) => ({ ...current, [key]: next }));
    await setGraphicVisibility(key, !next);
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        {t("overlay:broadcast.rundown.title")}
      </h2>
      {keys.length === 0 ? (
        <p className="text-xs text-text-muted">{t("overlay:broadcast.rundown.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {keys.map((key) => {
            const spec = layout[key];
            const visible = !hidden[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-text-secondary">
                  {visible ? (
                    <Eye className="h-3.5 w-3.5 text-accent-success" aria-hidden />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-text-tertiary" aria-hidden />
                  )}
                  {MODULE_LABELS[spec.module] ?? spec.module}
                </span>
                <Button
                  size="sm"
                  variant={visible ? "ghost" : "secondary"}
                  onClick={() => void toggle(key)}
                >
                  {visible
                    ? t("overlay:broadcast.rundown.out")
                    : t("overlay:broadcast.rundown.take")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-text-muted">
        {t("overlay:broadcast.rundown.hint")}
      </p>
    </Card>
  );
}
