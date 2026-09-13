import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useUIStore } from "@/stores/uiStore";
import {
  createBroadcastToken,
  setDiscordWebhook,
  testDiscordWebhook,
  getDockUrl,
  getLanUrl,
  getOverlayServerStatus,
  getOverlayUrls,
  getSettings,
  listBroadcastTokens,
  revokeBroadcastToken,
  setSettings,
  startOverlayServer,
  stopOverlayServer,
} from "@/lib/api";
import type {
  BroadcastToken,
  OverlayServerStatus,
  OverlayUrl,
} from "@/lib/types";
import { Copy, ExternalLink, Play, Plus, Square, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface ServerPanelProps {
  status: OverlayServerStatus | undefined;
  onStatusChange: () => void;
}

/** Server lifecycle, OBS URLs, LAN mode and role tokens. */
export function ServerPanel({ status, onStatusChange }: ServerPanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [port, setPort] = useState(String(status?.port || 9528));
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<OverlayUrl[]>([]);
  const [dockUrl, setDockUrl] = useState("");
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [lanEnabled, setLanEnabled] = useState(false);
  const [tokens, setTokens] = useState<BroadcastToken[]>([]);
  const [newRole, setNewRole] = useState<"admin" | "referee" | "viewer">("referee");
  const [newLabel, setNewLabel] = useState("");
  const [webhook, setWebhook] = useState("");

  const refresh = useCallback(async () => {
    const current = await getOverlayServerStatus();
    if (current.running) {
      setUrls(await getOverlayUrls());
      setDockUrl(await getDockUrl());
      setLanUrl(await getLanUrl());
    } else {
      setUrls([]);
      setDockUrl("");
      setLanUrl(null);
    }
    setTokens(await listBroadcastTokens());
    const settings = await getSettings();
    setLanEnabled(Boolean(settings.overlayBindLan));
    setWebhook(settings.discordWebhook ?? "");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, status?.running]);

  const toggleServer = async () => {
    setBusy(true);
    try {
      if (status?.running) {
        await stopOverlayServer();
        addToast({ type: "success", title: t("overlay:broadcast.server.stopped") });
      } else {
        const started = await startOverlayServer(Number(port) || 9528);
        addToast({
          type: "success",
          title: t("overlay:broadcast.server.started", { port: started.port }),
        });
      }
      onStatusChange();
      await refresh();
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

  const toggleLan = async (value: boolean) => {
    setLanEnabled(value);
    const settings = await getSettings();
    await setSettings({ ...settings, overlayBindLan: value });
    addToast({
      type: "success",
      title: value
        ? t("overlay:broadcast.server.lanOn")
        : t("overlay:broadcast.server.lanOff"),
    });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({ type: "success", title: t("overlay:broadcast.server.copied") });
    } catch {
      addToast({ type: "error", title: t("overlay:broadcast.toasts.copyError") });
    }
  };

  const createToken = async () => {
    try {
      const token = await createBroadcastToken(newRole, newLabel.trim() || newRole);
      setTokens((current) => [...current, token]);
      setNewLabel("");
      addToast({ type: "success", title: t("overlay:broadcast.server.tokenCreated") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.server.title")}
        </h2>
        <div className="flex items-center gap-3">
          <Badge variant={status?.running ? "success" : "default"}>
            {status?.running
              ? t("overlay:broadcast.server.running", { port: status.port })
              : t("overlay:broadcast.server.stopped")}
          </Badge>
          {status?.running && (
            <span className="text-[11px] text-text-muted">
              {t("overlay:broadcast.server.clients", {
                count: status.connected_clients,
              })}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <Input
            label={t("overlay:broadcast.server.port")}
            type="number"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            disabled={status?.running}
            containerClassName="w-28"
            size="sm"
          />
          <Button size="sm" isLoading={busy} onClick={() => void toggleServer()}>
            {status?.running ? (
              <>
                <Square className="h-3.5 w-3.5" aria-hidden />
                {t("overlay:broadcast.server.stop")}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden />
                {t("overlay:broadcast.server.start")}
              </>
            )}
          </Button>
        </div>
        <div className="mt-4 border-t border-border-subtle pt-3">
          <Switch
            checked={lanEnabled}
            onChange={(value) => void toggleLan(value)}
            label={t("overlay:broadcast.server.lan")}
            description={t("overlay:broadcast.server.lanHint")}
            size="sm"
          />
          {lanUrl && (
            <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-text-muted">
              {lanUrl}
              <button
                type="button"
                className="text-accent-primary hover:underline"
                onClick={() => void copy(lanUrl)}
              >
                <Copy className="h-3 w-3" aria-hidden />
              </button>
            </p>
          )}
        </div>
        {dockUrl && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="mb-1 text-xs font-medium text-text-secondary">
              {t("overlay:broadcast.server.dock")}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-bg-panel px-2 py-1.5 font-mono text-[11px] text-text-muted">
                {dockUrl}
              </code>
              <Button size="sm" variant="secondary" onClick={() => void copy(dockUrl)}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void openUrl(dockUrl)}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.server.urls")}
        </h2>
        {urls.length === 0 ? (
          <p className="text-xs text-text-muted">
            {t("overlay:broadcast.server.urlsEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {urls.map((item) => (
              <li key={item.id} className="rounded-lg border border-border-subtle bg-bg-panel p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{item.name}</p>
                    <p className="truncate text-[11px] text-text-muted">
                      {item.description}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void copy(item.url)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 xl:col-span-2">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.discord.title")}
        </h2>
        <p className="mb-3 text-[11px] text-text-muted">
          {t("overlay:broadcast.discord.hint")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label={t("overlay:broadcast.discord.webhook")}
            placeholder="https://discord.com/api/webhooks/…"
            value={webhook}
            onChange={(event) => setWebhook(event.target.value)}
            size="sm"
            containerClassName="min-w-[280px] flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void setDiscordWebhook(webhook.trim())
                .then(() =>
                  addToast({
                    type: "success",
                    title: t("overlay:broadcast.discord.saved"),
                  }),
                )
                .catch((error) =>
                  addToast({
                    type: "error",
                    title: t("overlay:broadcast.discord.invalid"),
                    message: String(error),
                  }),
                )
            }
          >
            {t("overlay:broadcast.discord.save")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!webhook.trim()}
            onClick={() =>
              void testDiscordWebhook()
                .then(() =>
                  addToast({
                    type: "success",
                    title: t("overlay:broadcast.discord.testOk"),
                  }),
                )
                .catch((error) =>
                  addToast({
                    type: "error",
                    title: t("overlay:broadcast.toasts.error"),
                    message: String(error),
                  }),
                )
            }
          >
            {t("overlay:broadcast.discord.test")}
          </Button>
        </div>
      </Card>

      <Card className="p-4 xl:col-span-2">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {t("overlay:broadcast.server.tokens")}
        </h2>
        <p className="mb-3 text-[11px] text-text-muted">
          {t("overlay:broadcast.server.tokensHint")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            aria-label="Rol"
            options={[
              { value: "admin", label: "Admin" },
              { value: "referee", label: "Árbitro" },
              { value: "viewer", label: "Viewer" },
            ]}
            value={newRole}
            onChange={(value) => setNewRole(value as typeof newRole)}
            size="sm"
          />
          <Input
            placeholder={t("overlay:broadcast.server.tokenLabel")}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            size="sm"
            containerClassName="w-52"
          />
          <Button size="sm" variant="secondary" onClick={() => void createToken()}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.server.create")}
          </Button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2"
            >
              <Badge variant={token.role === "admin" ? "accent" : "default"}>
                {token.role}
              </Badge>
              <span className="text-xs text-text-secondary">{token.label}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-tertiary">
                {token.token}
              </code>
              <Button size="sm" variant="ghost" onClick={() => void copy(token.token)}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-accent-danger"
                disabled={token.role === "admin"}
                onClick={() =>
                  void revokeBroadcastToken(token.id).then(() =>
                    setTokens((current) => current.filter((item) => item.id !== token.id)),
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
