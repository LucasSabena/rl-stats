import { useCallback, useEffect, useRef, useState } from "react";
import { OBSWebSocket } from "obs-websocket-js";
import { getSettings, setSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

export interface ObsConfig {
  enabled: boolean;
  url: string;
  password: string;
  autoSwitch: boolean;
  scenes: Record<string, string>;
}

export interface ObsController {
  connected: boolean;
  config: ObsConfig;
  saveConfig: (patch: Partial<ObsConfig>) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const DEFAULT_CONFIG: ObsConfig = {
  enabled: false,
  url: "ws://127.0.0.1:4455",
  password: "",
  autoSwitch: true,
  scenes: {},
};

function fromSettings(settings: AppSettings): ObsConfig {
  return {
    enabled: Boolean(settings.obsWsEnabled),
    url: settings.obsWsUrl || DEFAULT_CONFIG.url,
    password: settings.obsWsPassword ?? "",
    autoSwitch: settings.obsAutoSwitch !== false,
    scenes: {
      waiting: settings.obsSceneWaiting ?? "",
      live: settings.obsSceneLive ?? "",
      replay: settings.obsSceneReplay ?? "",
      post: settings.obsScenePost ?? "",
    },
  };
}

/**
 * obs-websocket client: connects to OBS Studio 28+ and switches the program
 * scene when the broadcast state changes (waiting/live/replay/post).
 */
export function useObsController(activeState: string): ObsController {
  const clientRef = useRef<OBSWebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<ObsConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    void getSettings().then((settings) => setConfig(fromSettings(settings)));
  }, []);

  const saveConfig = useCallback(async (patch: Partial<ObsConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    const settings = await getSettings();
    const next: AppSettings = {
      ...settings,
      obsWsEnabled: patch.enabled ?? config.enabled,
      obsWsUrl: patch.url ?? config.url,
      obsWsPassword: patch.password ?? config.password,
      obsAutoSwitch: patch.autoSwitch ?? config.autoSwitch,
      obsSceneWaiting: patch.scenes?.waiting ?? config.scenes.waiting,
      obsSceneLive: patch.scenes?.live ?? config.scenes.live,
      obsSceneReplay: patch.scenes?.replay ?? config.scenes.replay,
      obsScenePost: patch.scenes?.post ?? config.scenes.post,
    };
    await setSettings(next);
  }, [config]);

  const disconnect = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch {
        /* already closed */
      }
      clientRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    await disconnect();
    const client = new OBSWebSocket();
    clientRef.current = client;
    client.on("ConnectionClosed", () => setConnected(false));
    try {
      await client.connect(config.url, config.password || undefined);
      setConnected(true);
    } catch {
      setConnected(false);
      clientRef.current = null;
    }
  }, [config.url, config.password, disconnect]);

  // Auto-connect when enabled and the configuration changes.
  useEffect(() => {
    if (!config.enabled) {
      void disconnect();
      return;
    }
    let cancelled = false;
    void (async () => {
      const client = new OBSWebSocket();
      clientRef.current = client;
      client.on("ConnectionClosed", () => setConnected(false));
      try {
        await client.connect(config.url, config.password || undefined);
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) {
          setConnected(false);
          clientRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.enabled, config.url, config.password, disconnect]);

  // Switch scenes when the state changes.
  useEffect(() => {
    if (!connected || !config.autoSwitch) return;
    const scene = config.scenes[activeState];
    if (!scene) return;
    void clientRef.current
      ?.call("SetCurrentProgramScene", { sceneName: scene })
      .catch(() => undefined);
  }, [activeState, connected, config.autoSwitch, config.scenes]);

  return { connected, config, saveConfig, connect, disconnect };
}
