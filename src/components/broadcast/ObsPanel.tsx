import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import type { ObsController } from "@/hooks/useObsController";

interface ObsPanelProps {
  obs: ObsController;
}

/** obs-websocket connection + per-state scene mapping. */
export function ObsPanel({ obs }: ObsPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const [url, setUrl] = useState(obs.config.url);
  const [password, setPassword] = useState(obs.config.password);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.obs.title")}
        </h2>
        <Badge variant={obs.connected ? "success" : "default"}>
          {obs.connected
            ? t("overlay:broadcast.obs.connected")
            : t("overlay:broadcast.obs.disconnected")}
        </Badge>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        {t("overlay:broadcast.obs.hint")}
      </p>

      <div className="space-y-3">
        <Switch
          checked={obs.config.enabled}
          onChange={(value) => void obs.saveConfig({ enabled: value })}
          label={t("overlay:broadcast.obs.enabled")}
          size="sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            label={t("overlay:broadcast.obs.url")}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={() => void obs.saveConfig({ url: url.trim() })}
            size="sm"
          />
          <Input
            label={t("overlay:broadcast.obs.password")}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => void obs.saveConfig({ password })}
            size="sm"
          />
        </div>
        <Switch
          checked={obs.config.autoSwitch}
          onChange={(value) => void obs.saveConfig({ autoSwitch: value })}
          label={t("overlay:broadcast.obs.autoSwitch")}
          size="sm"
        />
        <div className="grid grid-cols-2 gap-2">
          {(["waiting", "live", "replay", "post"] as const).map((state) => (
            <Input
              key={state}
              label={t(`overlay:broadcast.obs.scene${state.charAt(0).toUpperCase()}${state.slice(1)}`)}
              value={obs.config.scenes[state] ?? ""}
              onChange={(event) =>
                void obs.saveConfig({
                  scenes: { ...obs.config.scenes, [state]: event.target.value },
                })
              }
              size="sm"
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!obs.config.enabled || obs.connected}
            onClick={() => void obs.connect()}
          >
            {t("overlay:broadcast.chat.connect")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!obs.connected}
            onClick={() => void obs.disconnect()}
          >
            {t("overlay:broadcast.chat.disconnect")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
