import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Slider } from "@/components/ui/Slider";
import { useUIStore } from "@/stores/uiStore";
import {
  getOverlayServerStatus,
  startOverlayServer,
  stopOverlayServer,
} from "@/lib/api";
import {
  DEFAULT_MODULE_GEOMETRY,
  DEFAULT_STUDIO_LAYOUT,
  STUDIO_MODULES,
  buildStudioUrl,
  clampModule,
  decodeLayout,
  deleteScene,
  encodeLayout,
  listScenes,
  saveScene,
  type StudioLayout,
  type StudioModule,
  type StudioModuleId,
  type StudioScene,
} from "@/lib/overlayLayout";
import type { OverlayServerStatus } from "@/lib/types";
import {
  Clapperboard,
  Copy,
  ExternalLink,
  MonitorPlay,
  Move,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

const MODULE_LABELS: Record<StudioModuleId, string> = {
  score: "studio.module.score",
  timer: "studio.module.timer",
  rosters: "studio.module.rosters",
  events: "studio.module.events",
  ball: "studio.module.ball",
  info: "studio.module.info",
};

export function StudioPage() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: StudioModuleId;
    startX: number;
    startY: number;
    moduleX: number;
    moduleY: number;
    rect: DOMRect;
  } | null>(null);

  const [layout, setLayout] = useState<StudioLayout>(() => {
    const fromUrl = decodeLayout(
      new URLSearchParams(window.location.search).get("layout")
    );
    return fromUrl ?? DEFAULT_STUDIO_LAYOUT;
  });
  const [selectedId, setSelectedId] = useState<StudioModuleId | null>("score");
  const [server, setServer] = useState<OverlayServerStatus | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [scenes, setScenes] = useState<StudioScene[]>(() => listScenes());
  const [sceneName, setSceneName] = useState("");
  const [previewLayout, setPreviewLayout] = useState(layout);

  useEffect(() => {
    getOverlayServerStatus()
      .then(setServer)
      .catch(() => setServer(null));
  }, []);

  // Debounce the live preview so dragging doesn't reload the iframe constantly.
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewLayout(layout), 450);
    return () => window.clearTimeout(timer);
  }, [layout]);

  const selected = useMemo(
    () => layout.modules.find((module) => module.id === selectedId) ?? null,
    [layout.modules, selectedId]
  );

  const previewUrl = useMemo(() => {
    if (!server?.running) return null;
    return buildStudioUrl(server.port, server.token ?? "", previewLayout);
  }, [previewLayout, server]);

  const studioUrl = useMemo(() => {
    if (!server?.running) return null;
    return buildStudioUrl(server.port, server.token ?? "", layout);
  }, [layout, server]);

  const updateModule = useCallback(
    (id: StudioModuleId, patch: Partial<StudioModule>) => {
      setLayout((prev) => ({
        ...prev,
        modules: prev.modules.map((module) =>
          module.id === id ? clampModule({ ...module, ...patch }) : module
        ),
      }));
    },
    []
  );

  const toggleModule = (id: StudioModuleId) => {
    setLayout((prev) => {
      const exists = prev.modules.some((module) => module.id === id);
      if (exists) {
        return {
          ...prev,
          modules: prev.modules.filter((module) => module.id !== id),
        };
      }
      return {
        ...prev,
        modules: [
          ...prev.modules,
          { id, ...DEFAULT_MODULE_GEOMETRY[id] },
        ],
      };
    });
  };

  const handleServerToggle = async () => {
    setServerBusy(true);
    try {
      if (server?.running) {
        await stopOverlayServer();
        setServer(await getOverlayServerStatus());
      } else {
        const status = await startOverlayServer(server?.port || 9528);
        setServer(status);
      }
    } catch {
      addToast({ type: "error", title: t("common:notifications.commandFailed") });
    } finally {
      setServerBusy(false);
    }
  };

  const handleCopyUrl = async (url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      addToast({ type: "success", title: t("overlay:studio.urlCopied") });
    } catch {
      addToast({ type: "error", title: t("overlay:studio.copyFailed") });
    }
  };

  const handleSaveScene = () => {
    const name = sceneName.trim();
    if (!name) return;
    setScenes(saveScene(name, layout));
    setSceneName("");
    addToast({ type: "success", title: t("overlay:studio.sceneSaved", { name }) });
  };

  const handleLoadScene = (name: string) => {
    const scene = scenes.find((entry) => entry.name === name);
    if (scene) {
      setLayout(scene.layout);
      addToast({ type: "info", title: t("overlay:studio.sceneLoaded", { name }) });
    }
  };

  const handleDeleteScene = () => {
    const name = sceneName.trim();
    if (!name) return;
    setScenes(deleteScene(name));
    setSceneName("");
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    module: StudioModule
  ) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: module.id,
      startX: event.clientX,
      startY: event.clientY,
      moduleX: module.x,
      moduleY: module.y,
      rect,
    };
    setSelectedId(module.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    updateModule(drag.id, {
      x: Math.round(drag.moduleX + dx),
      y: Math.round(drag.moduleY + dy),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <PageContainer>
      <div className="space-y-5 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {t("overlay:studio.title")}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {t("overlay:studio.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                server?.running
                  ? "flex items-center gap-1.5 rounded-full bg-accent-success-subtle px-2.5 py-1 text-[11px] font-semibold text-accent-success"
                  : "flex items-center gap-1.5 rounded-full bg-bg-elevated px-2.5 py-1 text-[11px] font-semibold text-text-tertiary"
              }
            >
              <span
                className={
                  server?.running
                    ? "h-1.5 w-1.5 rounded-full bg-accent-success"
                    : "h-1.5 w-1.5 rounded-full bg-text-tertiary"
                }
              />
              {server?.running
                ? t("overlay:studio.serverRunning", { port: server.port })
                : t("overlay:studio.serverStopped")}
            </span>
            <Button
              variant="secondary"
              size="sm"
              isLoading={serverBusy}
              onClick={() => void handleServerToggle()}
            >
              {server?.running
                ? t("overlay:studio.stopServer")
                : t("overlay:studio.startServer")}
            </Button>
          </div>
        </div>

        {!server?.running && (
          <EmptyState
            icon={MonitorPlay}
            title={t("overlay:studio.noServerTitle")}
            description={t("overlay:studio.noServerDescription")}
            actionLabel={t("overlay:studio.startServer")}
            onAction={() => void handleServerToggle()}
          />
        )}

        {server?.running && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* Canvas + preview */}
            <div className="space-y-4">
              <Card className="p-3">
                <div
                  ref={canvasRef}
                  className="relative aspect-video w-full overflow-hidden rounded-lg border border-border-subtle"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)",
                    backgroundSize: "24px 24px",
                    backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
                  }}
                >
                  {layout.modules.map((module) => {
                    const isSelected = module.id === selectedId;
                    return (
                      <div
                        key={module.id}
                        role="button"
                        tabIndex={0}
                        aria-label={t(`overlay:${MODULE_LABELS[module.id]}`)}
                        onPointerDown={(event) => onPointerDown(event, module)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 5 : 1;
                          if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            updateModule(module.id, { x: module.x - step });
                          } else if (event.key === "ArrowRight") {
                            event.preventDefault();
                            updateModule(module.id, { x: module.x + step });
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            updateModule(module.id, { y: module.y - step });
                          } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            updateModule(module.id, { y: module.y + step });
                          }
                        }}
                        className={
                          isSelected
                            ? "absolute flex cursor-grab touch-none select-none items-center justify-center rounded-md border-2 border-accent-primary bg-accent-primary-muted/40 text-accent-primary active:cursor-grabbing"
                            : "absolute flex cursor-grab touch-none select-none items-center justify-center rounded-md border border-border-highlight bg-bg-elevated/40 text-text-tertiary hover:border-accent-primary/50 active:cursor-grabbing"
                        }
                        style={{
                          left: `${module.x}%`,
                          top: `${module.y}%`,
                          width: `${module.w}%`,
                          height: `${module.h}%`,
                        }}
                      >
                        <span className="pointer-events-none flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                          <Move size={10} />
                          {t(`overlay:${MODULE_LABELS[module.id]}`)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-text-tertiary">
                  {t("overlay:studio.dragHint")}
                </p>
              </Card>

              {/* Live preview */}
              <Card className="p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t("overlay:studio.preview")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Copy}
                      onClick={() => void handleCopyUrl(studioUrl)}
                    >
                      {t("overlay:studio.copyObsUrl")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={ExternalLink}
                      onClick={() => studioUrl && void openUrl(studioUrl)}
                    >
                      {t("overlay:studio.openInBrowser")}
                    </Button>
                  </div>
                </div>
                {previewUrl ? (
                  <iframe
                    key={previewUrl}
                    src={previewUrl}
                    title={t("overlay:studio.preview")}
                    className="aspect-video w-full rounded-lg border border-border-subtle bg-black"
                  />
                ) : null}
              </Card>
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("overlay:studio.modules")}
                </p>
                <div className="mt-3 space-y-1.5">
                  {STUDIO_MODULES.map((id) => {
                    const active = layout.modules.some((module) => module.id === id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-panel px-2.5 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(id)}
                          className={
                            selectedId === id
                              ? "flex-1 text-left text-xs font-semibold text-accent-primary"
                              : "flex-1 text-left text-xs font-medium text-text-secondary hover:text-text-primary"
                          }
                        >
                          {t(`overlay:${MODULE_LABELS[id]}`)}
                        </button>
                        <button
                          type="button"
                          aria-label={
                            active
                              ? t("overlay:studio.removeModule")
                              : t("overlay:studio.addModule")
                          }
                          onClick={() => toggleModule(id)}
                          className={
                            active
                              ? "rounded-md p-1 text-accent-danger transition-colors hover:bg-bg-hover"
                              : "rounded-md p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-accent-primary"
                          }
                        >
                          {active ? <Trash2 size={13} /> : <Plus size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {selected && (
                <Card className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t("overlay:studio.position")}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(["x", "y", "w", "h"] as const).map((field) => (
                      <label key={field} className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase text-text-tertiary">
                          {field.toUpperCase()} (%)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(selected[field])}
                          onChange={(event) =>
                            updateModule(selected.id, {
                              [field]: Number(event.target.value),
                            })
                          }
                          className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("overlay:studio.theme")}
                </p>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-xs text-text-secondary">
                      {t("overlay:studio.accent")}
                    </span>
                    <input
                      type="color"
                      value={layout.theme.accent}
                      onChange={(event) =>
                        setLayout((prev) => ({
                          ...prev,
                          theme: { ...prev.theme, accent: event.target.value },
                        }))
                      }
                      className="h-8 w-12 cursor-pointer rounded border border-border-subtle bg-transparent"
                      aria-label={t("overlay:studio.accent")}
                    />
                  </label>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
                      <span>{t("overlay:studio.radius")}</span>
                      <span className="tabular text-text-tertiary">
                        {layout.theme.radius}px
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={24}
                      step={1}
                      value={layout.theme.radius}
                      onChange={(value) =>
                        setLayout((prev) => ({
                          ...prev,
                          theme: { ...prev.theme, radius: value },
                        }))
                      }
                      aria-label={t("overlay:studio.radius")}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-secondary">
                      {t("overlay:studio.scale")}
                    </p>
                    <SegmentedControl
                      size="sm"
                      aria-label={t("overlay:studio.scale")}
                      value={String(layout.theme.scale)}
                      onChange={(value) =>
                        setLayout((prev) => ({
                          ...prev,
                          theme: { ...prev.theme, scale: Number(value) },
                        }))
                      }
                      options={[
                        { value: "0.8", label: "80%" },
                        { value: "1", label: "100%" },
                        { value: "1.25", label: "125%" },
                        { value: "1.5", label: "150%" },
                      ]}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("overlay:studio.scenes")}
                </p>
                <div className="mt-3 space-y-2">
                  {scenes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {scenes.map((scene) => (
                        <button
                          key={scene.name}
                          type="button"
                          onClick={() => handleLoadScene(scene.name)}
                          className="rounded-full border border-border-subtle px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary"
                        >
                          {scene.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sceneName}
                      onChange={(event) => setSceneName(event.target.value)}
                      placeholder={t("overlay:studio.sceneName")}
                      className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={Save}
                      disabled={!sceneName.trim()}
                      onClick={handleSaveScene}
                    >
                      {t("common:buttons.save")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Trash2}
                      disabled={!sceneName.trim()}
                      onClick={handleDeleteScene}
                    >
                      {t("common:buttons.delete")}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-subtle pt-2">
                    <button
                      type="button"
                      onClick={() => setLayout(DEFAULT_STUDIO_LAYOUT)}
                      className="flex items-center gap-1.5 text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <RotateCcw size={12} />
                      {t("overlay:studio.reset")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyUrl(
                          `${window.location.origin}${window.location.pathname}?layout=${encodeLayout(layout)}`
                        )
                      }
                      className="flex items-center gap-1.5 text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <Clapperboard size={12} />
                      {t("overlay:studio.shareLayout")}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
