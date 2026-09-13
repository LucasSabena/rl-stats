import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import {
  listBroadcastPacks,
  listBroadcastScenes,
  refreshBroadcast,
  saveBroadcastPack,
  saveBroadcastScene,
} from "@/lib/api";
import type {
  BroadcastPack,
  BroadcastScene,
  SceneModule,
} from "@/lib/types";
import { Download, Eye, EyeOff, Move, Plus, Save, Trash2, Upload } from "lucide-react";

const STATES = ["waiting", "live", "replay", "post", "brb"] as const;

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
  bracket: "Llave",
  session: "Sesión",
  mvp: "MVP",
  info: "Info",
};

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Default placements (% of the 16:9 stage) when a module is added. */
const DEFAULT_PLACEMENT: Record<string, Placement> = {
  scorebug: { x: 27, y: 3, w: 46, h: 9 },
  series: { x: 40, y: 13, w: 20, h: 5 },
  roster: { x: 2, y: 24, w: 22, h: 32 },
  events: { x: 26, y: 66, w: 26, h: 26 },
  chat: { x: 52, y: 66, w: 23, h: 26 },
  brand: { x: 87, y: 92, w: 11, h: 6 },
  countdown: { x: 34, y: 34, w: 32, h: 20 },
  timer: { x: 40, y: 6, w: 20, h: 12 },
  socials: { x: 30, y: 62, w: 40, h: 8 },
  sponsors: { x: 4, y: 88, w: 16, h: 8 },
  replaybadge: { x: 44, y: 16, w: 12, h: 6 },
  upnext: { x: 12, y: 68, w: 30, h: 16 },
  focus: { x: 2, y: 62, w: 22, h: 14 },
  bracket: { x: 62, y: 34, w: 36, h: 30 },
  session: { x: 2, y: 10, w: 24, h: 16 },
  mvp: { x: 30, y: 36, w: 40, h: 24 },
  info: { x: 12, y: 8, w: 22, h: 12 },
};

const ALL_MODULES = Object.keys(DEFAULT_PLACEMENT);

interface FormatPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Layout formats: one click rearranges the modules into a known broadcast
 * shape. Modules missing from the chosen format are turned off (not deleted),
 * so switching back re-enables them.
 */
const FORMAT_PRESETS: Record<string, Record<string, FormatPlacement>> = {
  full: {
    scorebug: { x: 27, y: 3, w: 46, h: 9 },
    series: { x: 40, y: 13, w: 20, h: 5 },
    "roster:blue": { x: 1.5, y: 20, w: 22, h: 36 },
    "roster:orange": { x: 76.5, y: 20, w: 22, h: 36 },
    events: { x: 25, y: 68, w: 26, h: 24 },
    chat: { x: 52, y: 68, w: 23, h: 24 },
    brand: { x: 88, y: 92, w: 10, h: 6 },
  },
  oneLine: {
    scorebug: { x: 8, y: 86, w: 84, h: 9 },
    brand: { x: 90, y: 86, w: 8, h: 9 },
  },
  corner: {
    scorebug: { x: 2, y: 3, w: 38, h: 10 },
    series: { x: 2, y: 14.5, w: 22, h: 5 },
    events: { x: 2, y: 70, w: 24, h: 22 },
    brand: { x: 88, y: 92, w: 10, h: 6 },
  },
  side: {
    scorebug: { x: 2, y: 3, w: 40, h: 9 },
    "roster:blue": { x: 2, y: 15, w: 24, h: 48 },
    "roster:orange": { x: 2, y: 66, w: 24, h: 30 },
    chat: { x: 74, y: 15, w: 24, h: 52 },
    brand: { x: 88, y: 92, w: 10, h: 6 },
  },
};

const FORMAT_LABELS: Record<string, string> = {
  full: "Completo",
  oneLine: "Línea inferior",
  corner: "Esquina",
  side: "Lateral",
};

interface ScenePanelProps {
  port: number;
  token: string;
  serverRunning: boolean;
}

/**
 * Scene + design pack editor.
 *
 * Packs and layouts persist in SQLite (no more base64 URLs): pick a state,
 * choose a pack, add/remove modules, drag them on the live preview and save.
 */
export function ScenePanel({ port, token, serverRunning }: ScenePanelProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startY: number; x: number; y: number } | null>(
    null,
  );

  const [packs, setPacks] = useState<BroadcastPack[]>([]);
  const [scenes, setScenes] = useState<BroadcastScene[]>([]);
  const [state, setState] = useState<(typeof STATES)[number]>("live");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [packId, setPackId] = useState("prime-broadcast");
  const [layout, setLayout] = useState<Record<string, SceneModule>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const historyRef = useRef<Record<string, SceneModule>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const importRef = useRef<HTMLInputElement>(null);

  /** Snapshots the layout for undo/redo (drag end, add, remove, toggle). */
  const commitLayout = useCallback(
    (next: Record<string, SceneModule>) => {
      setLayout(next);
      const history = historyRef.current.slice(0, historyIndex + 1);
      history.push(next);
      historyRef.current = history.slice(-50);
      setHistoryIndex(historyRef.current.length - 1);
    },
    [historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const index = historyIndex - 1;
    setHistoryIndex(index);
    setLayout(historyRef.current[index]);
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= historyRef.current.length - 1) return;
    const index = historyIndex + 1;
    setHistoryIndex(index);
    setLayout(historyRef.current[index]);
  }, [historyIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const load = useCallback(async () => {
    const [packsResponse, sceneList] = await Promise.all([
      listBroadcastPacks(),
      listBroadcastScenes(),
    ]);
    setPacks(packsResponse.packs);
    setScenes(sceneList);
    return sceneList;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Switching state loads that state's scene (or starts an empty draft).
  useEffect(() => {
    const scene = scenes.find((candidate) => candidate.state === state);
    if (scene) {
      setSceneId(scene.id);
      setPackId(scene.packId);
      historyRef.current = [scene.layout ?? {}];
      setHistoryIndex(0);
      setLayout(scene.layout ?? {});
    } else {
      setSceneId(null);
      historyRef.current = [{}];
      setHistoryIndex(0);
      setLayout({});
    }
    setSelected(null);
  }, [state, scenes]);

  const previewUrl = useMemo(() => {
    if (!serverRunning) return null;
    const query = new URLSearchParams();
    query.set("token", token);
    if (sceneId) query.set("scene", sceneId);
    query.set("state", state);
    query.set("pack", packId);
    return `http://127.0.0.1:${port}/overlays/live?${query.toString()}`;
  }, [serverRunning, token, sceneId, state, packId, port]);

  const addModule = (module: string) => {
    const placement = DEFAULT_PLACEMENT[module];
    if (!placement) return;
    const key = `${module}-${Math.random().toString(36).slice(2, 9)}`;
    const entry: SceneModule = {
      module,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      enabled: true,
    };
    commitLayout({ ...layout, [key]: entry });
    setSelected(key);
  };

  const removeModule = (key: string) => {
    const next = { ...layout };
    delete next[key];
    commitLayout(next);
    if (selected === key) setSelected(null);
  };

  const updateModule = (key: string, patch: Partial<SceneModule>) => {
    setLayout((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    key: string,
  ) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
      x: layout[key]?.x ?? 0,
      y: layout[key]?.y ?? 0,
    };
    setSelected(key);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const SNAP_THRESHOLD = 1.6;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * 100;
    const dragged = layout[drag.key];
    let x = Math.min(100, Math.max(0, drag.x + deltaX));
    let y = Math.min(100, Math.max(0, drag.y + deltaY));
    const width = dragged?.w ?? 0;
    const height = dragged?.h ?? 0;

    // Candidate guides: stage edges/center plus every other module's edges.
    const xTargets: number[] = [0, 50, 100 - width];
    const yTargets: number[] = [0, 50, 100 - height];
    Object.entries(layout).forEach(([key, spec]) => {
      if (key === drag.key) return;
      xTargets.push(spec.x, spec.x + spec.w, spec.x + spec.w / 2 - width / 2);
      yTargets.push(spec.y, spec.y + spec.h, spec.y + spec.h / 2 - height / 2);
    });

    const activeGuides: { x?: number; y?: number } = {};
    let bestX: number | null = null;
    let bestXDistance = SNAP_THRESHOLD;
    xTargets.forEach((target) => {
      const distance = Math.abs(x - target);
      if (distance < bestXDistance) {
        bestXDistance = distance;
        bestX = target;
      }
    });
    if (bestX !== null) {
      x = bestX;
      activeGuides.x = bestX;
    }
    let bestY: number | null = null;
    let bestYDistance = SNAP_THRESHOLD;
    yTargets.forEach((target) => {
      const distance = Math.abs(y - target);
      if (distance < bestYDistance) {
        bestYDistance = distance;
        bestY = target;
      }
    });
    if (bestY !== null) {
      y = bestY;
      activeGuides.y = bestY;
    }
    setGuides(activeGuides);

    setLayout((current) => ({
      ...current,
      [drag.key]: {
        ...current[drag.key],
        x: Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
        y: Math.round(Math.min(100, Math.max(0, y)) * 10) / 10,
      },
    }));
  };

  const onPointerUp = () => {
    if (dragRef.current) {
      const history = historyRef.current.slice(0, historyIndex + 1);
      history.push(layout);
      historyRef.current = history.slice(-50);
      setHistoryIndex(historyRef.current.length - 1);
    }
    dragRef.current = null;
    setGuides({});
  };

  /** Downloads the selected pack as a portable `.rlskin.json` file. */
  const exportPack = () => {
    const pack = packs.find((candidate) => candidate.id === packId);
    if (!pack) return;
    const payload = {
      kind: "rl-stats-pack",
      version: 1,
      pack: {
        name: pack.name,
        baseId: pack.baseId ?? pack.id,
        tokens: pack.tokens,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pack.id}.rlskin.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: t("overlay:broadcast.scene.exported") });
  };

  /** Imports a `.rlskin.json` as a new custom pack. */
  const importPack = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as {
        kind?: string;
        pack?: { name?: string; baseId?: string; tokens?: unknown };
      };
      const pack = payload.pack;
      if (
        payload.kind !== "rl-stats-pack" ||
        !pack ||
        typeof pack.name !== "string" ||
        typeof pack.tokens !== "object" ||
        pack.tokens === null
      ) {
        throw new Error("invalid pack file");
      }
      const saved = await saveBroadcastPack({
        name: pack.name,
        baseId: pack.baseId ?? null,
        tokens: pack.tokens as Record<string, unknown>,
      });
      await load();
      setPackId(saved.id);
      addToast({
        type: "success",
        title: t("overlay:broadcast.scene.imported", { name: saved.name }),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  /** Rearranges modules into a broadcast format preset (undoable). */
  const applyFormat = (format: string) => {
    const preset = FORMAT_PRESETS[format];
    if (!preset) return;
    const next: Record<string, SceneModule> = {};
    Object.entries(layout).forEach(([key, spec]) => {
      const lookup =
        spec.module === "roster"
          ? `roster:${spec.team === "orange" ? "orange" : "blue"}`
          : spec.module;
      const placement = preset[lookup];
      next[key] = placement
        ? { ...spec, ...placement, enabled: true }
        : { ...spec, enabled: false };
    });
    commitLayout(next);
    addToast({
      type: "success",
      title: t("overlay:broadcast.scene.formatApplied", {
        format: FORMAT_LABELS[format] ?? format,
      }),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const scene = await saveBroadcastScene({
        id: sceneId,
        name: t(`overlay:broadcast.states.${state}`),
        packId,
        sceneState: state,
        layout,
      });
      setSceneId(scene.id);
      await load();
      await refreshBroadcast();
      addToast({ type: "success", title: t("overlay:broadcast.scene.saved") });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const entries = Object.entries(layout);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setState(candidate)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  state === candidate
                    ? "bg-accent-primary text-accent-primary-fg"
                    : "bg-bg-panel text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(`overlay:broadcast.states.${candidate}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label={t("overlay:broadcast.scene.pack")}
              options={packs.map((pack) => ({
                value: pack.id,
                label: `${pack.name}${pack.builtIn ? "" : " · custom"}`,
              }))}
              value={packId}
              onChange={setPackId}
              size="sm"
            />
            <Button size="sm" variant="ghost" onClick={exportPack}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.scene.export")}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPack(file);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.scene.import")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={historyIndex <= 0}
              onClick={undo}
            >
              {t("overlay:broadcast.scene.undo")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={historyIndex >= historyRef.current.length - 1}
              onClick={redo}
            >
              {t("overlay:broadcast.scene.redo")}
            </Button>
            <Button size="sm" isLoading={saving} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.scene.save")}
            </Button>
          </div>
        </div>

        <div
          ref={canvasRef}
          className="relative aspect-video w-full overflow-hidden rounded-lg border border-border-subtle bg-[repeating-conic-gradient(rgba(255,255,255,0.03)_0%_25%,transparent_0%_50%)] [background-size:24px_24px]"
        >
          {previewUrl ? (
            <iframe
              title={t("overlay:broadcast.scene.preview")}
              src={previewUrl}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
              {t("overlay:broadcast.scene.noServer")}
            </div>
          )}
          {guides.x !== undefined && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-accent-primary/70"
              style={{ left: `${guides.x}%` }}
            />
          )}
          {guides.y !== undefined && (
            <div
              className="pointer-events-none absolute inset-x-0 h-px bg-accent-primary/70"
              style={{ top: `${guides.y}%` }}
            />
          )}
          <div className="absolute inset-0">
            {entries.map(([key, spec]) => (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={MODULE_LABELS[spec.module] ?? spec.module}
                onPointerDown={(event) => onPointerDown(event, key)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className={`absolute cursor-move rounded border-2 text-[10px] font-semibold uppercase tracking-wide ${
                  selected === key
                    ? "border-accent-primary bg-accent-primary/25"
                    : "border-accent-primary/40 bg-accent-primary/10"
                } ${spec.enabled === false ? "opacity-40" : ""}`}
                style={{
                  left: `${spec.x}%`,
                  top: `${spec.y}%`,
                  width: `${spec.w}%`,
                  height: `${spec.h}%`,
                }}
              >
                <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 text-text-primary drop-shadow">
                  <Move className="h-3 w-3" aria-hidden />
                  {MODULE_LABELS[spec.module] ?? spec.module}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          {t("overlay:broadcast.scene.dragHint")}
        </p>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.scene.formats")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(FORMAT_PRESETS).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => applyFormat(format)}
                className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:border-accent-primary/60 hover:text-text-primary"
              >
                {FORMAT_LABELS[format]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            {t("overlay:broadcast.scene.formatsHint")}
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.scene.modules")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MODULES.map((module) => (
              <button
                key={module}
                type="button"
                onClick={() => addModule(module)}
                className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:border-accent-primary/60 hover:text-text-primary"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {MODULE_LABELS[module]}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.scene.layerList")}
          </h3>
          {entries.length === 0 ? (
            <p className="text-xs text-text-muted">
              {t("overlay:broadcast.scene.empty")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {entries.map(([key, spec]) => (
                <li
                  key={key}
                  className={`rounded-lg border px-2.5 py-2 ${
                    selected === key
                      ? "border-accent-primary/60 bg-accent-primary/10"
                      : "border-border-subtle bg-bg-panel"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left text-xs font-medium text-text-primary"
                      onClick={() => setSelected(key)}
                    >
                      {spec.enabled === false ? (
                        <EyeOff className="h-3.5 w-3.5 text-text-tertiary" aria-hidden />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-accent-success" aria-hidden />
                      )}
                      <span className="truncate">
                        {MODULE_LABELS[spec.module] ?? spec.module}
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      {spec.module === "roster" ? (
                        <Select
                          aria-label="Equipo"
                          options={[
                            { value: "blue", label: "Azul" },
                            { value: "orange", label: "Naranja" },
                          ]}
                          value={spec.team === "orange" ? "orange" : "blue"}
                          onChange={(value) => updateModule(key, { team: value as "blue" | "orange" })}
                          size="sm"
                        />
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateModule(key, { enabled: spec.enabled === false })
                        }
                      >
                        {spec.enabled === false ? "On" : "Off"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-accent-danger"
                        onClick={() => removeModule(key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {selected === key && (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {(["x", "y", "w", "h"] as const).map((axis) => (
                        <Input
                          key={axis}
                          label={axis.toUpperCase()}
                          type="number"
                          size="sm"
                          value={spec[axis]}
                          onChange={(event) =>
                            updateModule(key, {
                              [axis]: Number(event.target.value),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
