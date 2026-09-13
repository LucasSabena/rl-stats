import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useUIStore } from "@/stores/uiStore";
import { configureChat, getChatStatus, getSettings } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  connected: boolean;
}

/** Read-only Twitch/Kick chat: configuration plus the live message feed. */
export function ChatPanel({ messages, connected }: ChatPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [enabled, setEnabled] = useState(false);
  const [twitch, setTwitch] = useState("");
  const [kick, setKick] = useState("");
  const [running, setRunning] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [settings, status] = await Promise.all([getSettings(), getChatStatus()]);
    setEnabled(Boolean(settings.chatEnabled));
    setTwitch(settings.chatTwitchChannel ?? "");
    setKick(settings.chatKickChannel ?? "");
    setRunning(status.running ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      const status = await configureChat({
        enabled,
        twitchChannel: twitch.trim(),
        kickChannel: kick.trim(),
      });
      setRunning(status.running ?? []);
      addToast({
        type: "success",
        title: t("overlay:broadcast.chat.connected"),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await configureChat({ enabled: false, twitchChannel: "", kickChannel: "" });
      setEnabled(false);
      setRunning([]);
      addToast({ type: "success", title: t("overlay:broadcast.chat.disconnected") });
    } finally {
      setBusy(false);
    }
  };

  const visible = messages.slice(-40).reverse();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.chat.title")}
        </h2>
        <div className="space-y-3">
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label={t("overlay:broadcast.chat.enabled")}
            size="sm"
          />
          <Input
            label="Twitch"
            placeholder="mi_canal"
            value={twitch}
            onChange={(event) => setTwitch(event.target.value)}
            size="sm"
          />
          <Input
            label="Kick"
            placeholder="mi-canal"
            value={kick}
            onChange={(event) => setKick(event.target.value)}
            size="sm"
          />
          <div className="flex gap-2">
            <Button size="sm" isLoading={busy} onClick={() => void connect()}>
              {t("overlay:broadcast.chat.connect")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={running.length === 0}
              onClick={() => void disconnect()}
            >
              {t("overlay:broadcast.chat.disconnect")}
            </Button>
          </div>
          <p className="text-[11px] text-text-muted">
            {t("overlay:broadcast.chat.hint")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {running.length === 0 ? (
              <Badge variant="default">
                {t("overlay:broadcast.chat.stopped")}
              </Badge>
            ) : (
              running.map((platform) => (
                <Badge key={platform} variant="success">
                  {platform}
                </Badge>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card className="flex min-h-[420px] flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.chat.live")}
          </h2>
          <span className="text-[11px] text-text-tertiary">
            {connected
              ? t("overlay:broadcast.server.connected")
              : t("overlay:broadcast.server.disconnected")}
          </span>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <p className="text-xs text-text-muted">
              {t("overlay:broadcast.chat.empty")}
            </p>
          ) : (
            visible.map((message, index) => (
              <p key={`${message.timestamp}-${index}`} className="text-sm leading-snug">
                <span className="mr-2 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] uppercase text-text-tertiary">
                  {message.platform}
                </span>
                <span
                  className="mr-2 font-semibold"
                  style={{ color: message.color || "var(--accent-primary)" }}
                >
                  {message.user}
                </span>
                <span className="text-text-secondary">{message.text}</span>
              </p>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
