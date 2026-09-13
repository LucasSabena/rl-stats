import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Clapperboard,
  Dumbbell,
  FileDown,
  Gamepad2,
  History,
  Home,
  MonitorPlay,
  Radio,
  RadioTower,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  exportHistoryCsv,
  getMatches,
  getOverlayServerStatus,
  getOverlayWindowState,
  getPlayerDirectory,
  startOverlayServer,
  stopOverlayServer,
  toggleOverlayEnabled,
} from "@/lib/api";
import { getArenaDisplayName } from "@/lib/arenaMap";
import { QUERY_STALE_TIME } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { MatchSummary, PlayerDirectoryEntry } from "@/lib/types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  kind: "nav";
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  keywords: string;
}

interface CommandItem {
  kind: "command";
  id: string;
  label: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void | Promise<void>;
}

interface PlayerItem {
  kind: "player";
  id: string;
  player: PlayerDirectoryEntry;
}

interface MatchItem {
  kind: "match";
  id: string;
  match: MatchSummary;
}

type PaletteItem = NavItem | CommandItem | PlayerItem | MatchItem;

interface PaletteGroup {
  id: string;
  title: string | null;
  items: PaletteItem[];
}

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 200;
const RESULT_LIMIT = 5;
const RECENT_KEY = "rl-palette-recent";
const MAX_RECENTS = 5;

const KBD_CLASS =
  "rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 font-mono text-[10px] leading-none text-text-tertiary";

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const recents = [id, ...readRecents().filter((entry) => entry !== id)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
  } catch {
    // Recents are a nicety; ignore storage failures.
  }
}

/** Simple relevance score: prefix > word start > substring. */
function scoreItem(label: string, keywords: string, query: string): number {
  const haystack = `${label} ${keywords}`.toLowerCase();
  const labelLower = label.toLowerCase();
  if (labelLower.startsWith(query)) return 3;
  if (haystack.split(/[\s\-/]+/).some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 1;
  return 0;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["common", "history"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const addToast = useUIStore((state) => state.addToast);

  const commandMode = search.trim().startsWith(">");
  const effectiveSearch = commandMode ? search.trim().slice(1).trim() : search.trim();

  useEffect(() => {
    const trimmed = effectiveSearch;
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setDebouncedSearch("");
      return;
    }
    const timer = window.setTimeout(
      () => setDebouncedSearch(trimmed),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [effectiveSearch]);

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    setDebouncedSearch("");
    setActiveIndex(0);
    setRecentIds(readRecents());
    inputRef.current?.focus();
  }, [isOpen]);

  const searchReady =
    isOpen && !commandMode && debouncedSearch.length >= MIN_SEARCH_LENGTH;

  const playersQuery = useQuery({
    queryKey: ["command-palette", "players", debouncedSearch],
    queryFn: () =>
      getPlayerDirectory({ search: debouncedSearch, limit: RESULT_LIMIT }),
    enabled: searchReady,
    staleTime: QUERY_STALE_TIME.matches,
    retry: false,
  });

  const matchesQuery = useQuery({
    queryKey: ["command-palette", "matches", debouncedSearch],
    queryFn: () => getMatches({ search: debouncedSearch, limit: RESULT_LIMIT }),
    enabled: searchReady,
    staleTime: QUERY_STALE_TIME.matches,
    retry: false,
  });

  const navigation = useMemo<NavItem[]>(
    () => [
      {
        kind: "nav",
        id: "nav-live",
        label: t("common:commandPalette.live", { defaultValue: "En vivo" }),
        path: "/",
        icon: Home,
        keywords: "live en vivo partida actual dashboard inicio",
      },
      {
        kind: "nav",
        id: "nav-history",
        label: t("common:commandPalette.history", { defaultValue: "Historial" }),
        path: "/history",
        icon: History,
        keywords: "history partidas matches historial",
      },
      {
        kind: "nav",
        id: "nav-analytics",
        label: t("common:commandPalette.analytics", { defaultValue: "Análisis" }),
        path: "/analytics",
        icon: BarChart3,
        keywords: "analytics estadisticas stats rendimiento analisis",
      },
      {
        kind: "nav",
        id: "nav-sessions",
        label: t("common:commandPalette.sessions", { defaultValue: "Sesiones" }),
        path: "/sessions",
        icon: CalendarClock,
        keywords: "sessions sesiones bloques fatiga",
      },
      {
        kind: "nav",
        id: "nav-studio",
        label: t("common:commandPalette.studio", { defaultValue: "Overlay Studio" }),
        path: "/studio",
        icon: Clapperboard,
        keywords: "studio overlay obs stream editor drag",
      },
      {
        kind: "nav",
        id: "nav-records",
        label: t("common:commandPalette.records", { defaultValue: "Récords" }),
        path: "/records",
        icon: Trophy,
        keywords: "records récords logros achievements hall of fame",
      },
      {
        kind: "nav",
        id: "nav-players",
        label: t("common:commandPalette.players", { defaultValue: "Jugadores" }),
        path: "/players",
        icon: Users,
        keywords: "players directorio jugadores",
      },
      {
        kind: "nav",
        id: "nav-training",
        label: t("common:commandPalette.trainingPacks", { defaultValue: "Entrenamientos" }),
        path: "/training-packs",
        icon: Dumbbell,
        keywords: "training packs entrenamientos practica",
      },
      {
        kind: "nav",
        id: "nav-pro-configs",
        label: t("common:commandPalette.proConfigs", { defaultValue: "Pro Configs" }),
        path: "/pro-configs",
        icon: Gamepad2,
        keywords: "pro configs configuraciones profesionales ajustes",
      },
      {
        kind: "nav",
        id: "nav-profile",
        label: t("common:commandPalette.profile", { defaultValue: "Perfil" }),
        path: "/profile",
        icon: User,
        keywords: "profile perfil carrera presets",
      },
      {
        kind: "nav",
        id: "nav-settings",
        label: t("common:commandPalette.settings", { defaultValue: "Ajustes" }),
        path: "/settings",
        icon: Settings,
        keywords: "settings configuracion preferencias ajustes",
      },
    ],
    [t],
  );

  const runOverlayServerToggle = async () => {
    const status = await getOverlayServerStatus();
    if (status.running) {
      await stopOverlayServer();
      addToast({ type: "info", title: t("common:commandPalette.overlayServerStopped") });
    } else {
      const next = await startOverlayServer(status.port || 9528);
      addToast({
        type: "success",
        title: t("common:commandPalette.overlayServerStarted", { port: next.port }),
      });
    }
  };

  const runOverlayWindowToggle = async () => {
    const before = await getOverlayWindowState();
    const after = await toggleOverlayEnabled();
    addToast({
      type: "info",
      title: after.visible
        ? t("common:commandPalette.overlayShown")
        : t("common:commandPalette.overlayHidden"),
      message: before.visible ? undefined : t("common:commandPalette.overlayHint"),
    });
  };

  const runExportCsv = async () => {
    const csv = await exportHistoryCsv({});
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rl-stats-historial-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: t("common:commandPalette.exported") });
  };

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        kind: "command",
        id: "cmd-theme",
        label: t("common:commandPalette.cmdTheme"),
        icon: Sun,
        keywords: "theme tema claro oscuro dark light apariencia",
        run: () => useUIStore.getState().toggleTheme(),
      },
      {
        kind: "command",
        id: "cmd-overlay-server",
        label: t("common:commandPalette.cmdOverlayServer"),
        icon: RadioTower,
        keywords: "overlay servidor streaming obs iniciar detener",
        run: runOverlayServerToggle,
      },
      {
        kind: "command",
        id: "cmd-overlay-window",
        label: t("common:commandPalette.cmdOverlayWindow"),
        icon: MonitorPlay,
        keywords: "overlay ventana mostrar ocultar juego",
        run: runOverlayWindowToggle,
      },
      {
        kind: "command",
        id: "cmd-export-csv",
        label: t("common:commandPalette.cmdExportCsv"),
        icon: FileDown,
        keywords: "exportar csv historial datos descargar",
        run: runExportCsv,
      },
      {
        kind: "command",
        id: "cmd-onboarding",
        label: t("common:commandPalette.cmdOnboarding"),
        icon: Sparkles,
        keywords: "onboarding tour bienvenida ayuda tutorial",
        run: () => useSettingsStore.getState().restartOnboarding(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast, t]
  );

  const normalizedSearch = search.trim().toLowerCase();

  const scoreAndSort = <T extends { label: string; keywords: string }>(
    items: T[]
  ): T[] => {
    if (!normalizedSearch) return items;
    return items
      .map((item) => ({ item, score: scoreItem(item.label, item.keywords, normalizedSearch) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  };

  const filteredNavigation = useMemo(
    () => (commandMode ? [] : scoreAndSort(navigation)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commandMode, navigation, normalizedSearch]
  );

  const filteredCommands = useMemo(
    () => scoreAndSort(commands),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commands, normalizedSearch]
  );

  const recents = useMemo(() => {
    if (normalizedSearch || commandMode) return [];
    const byId = new Map<string, NavItem>(
      navigation.map((item) => [item.id, item])
    );
    return recentIds
      .map((id) => byId.get(id))
      .filter((item): item is NavItem => Boolean(item));
  }, [commandMode, navigation, normalizedSearch, recentIds]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const result: PaletteGroup[] = [];
    if (recents.length > 0) {
      result.push({
        id: "recent",
        title: t("common:commandPalette.recentSection", { defaultValue: "Recientes" }),
        items: recents,
      });
    }
    if (filteredNavigation.length > 0) {
      result.push({
        id: "navigate",
        title: t("common:commandPalette.navigateSection", { defaultValue: "Ir a" }),
        items: filteredNavigation,
      });
    }
    if (filteredCommands.length > 0) {
      result.push({
        id: "commands",
        title: t("common:commandPalette.actionsSection", { defaultValue: "Acciones" }),
        items: filteredCommands,
      });
    }
    const players = searchReady ? (playersQuery.data ?? []) : [];
    if (players.length > 0) {
      result.push({
        id: "players",
        title: t("common:commandPalette.playersSection", { defaultValue: "Jugadores" }),
        items: players.map((player) => ({
          kind: "player" as const,
          id: `player-${player.primary_id}`,
          player,
        })),
      });
    }
    const matches = searchReady ? (matchesQuery.data ?? []) : [];
    if (matches.length > 0) {
      result.push({
        id: "matches",
        title: t("common:commandPalette.matchesSection", { defaultValue: "Partidas" }),
        items: matches.map((match) => ({
          kind: "match" as const,
          id: `match-${match.id}`,
          match,
        })),
      });
    }
    return result;
  }, [
    filteredCommands,
    filteredNavigation,
    matchesQuery.data,
    playersQuery.data,
    recents,
    searchReady,
    t,
  ]);

  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const activeItemIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
  const isSearching = searchReady && (playersQuery.isLoading || matchesQuery.isLoading);
  const showEmpty = !isSearching && items.length === 0;

  useEffect(() => {
    if (!isOpen) return;
    const activeElement = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [activeItemIndex, isOpen]);

  async function handleSelect(item: PaletteItem) {
    if (item.kind === "nav") {
      pushRecent(item.id);
      navigate(item.path);
    } else if (item.kind === "command") {
      try {
        await item.run();
      } catch {
        addToast({ type: "error", title: t("common:commandPalette.commandFailed") });
      }
    } else if (item.kind === "player") {
      navigate(`/players/${item.player.primary_id}`);
    } else {
      navigate(`/history/${item.match.id}`);
    }
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    const key =
      event.key === "j" || event.key === "J"
        ? "ArrowDown"
        : event.key === "k" || event.key === "K"
          ? "ArrowUp"
          : event.key;
    switch (key) {
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      case "ArrowDown":
        if (items.length === 0) return;
        event.preventDefault();
        setActiveIndex((activeItemIndex + 1) % items.length);
        break;
      case "ArrowUp":
        if (items.length === 0) return;
        event.preventDefault();
        setActiveIndex((activeItemIndex - 1 + items.length) % items.length);
        break;
      case "Enter": {
        const item = items[activeItemIndex];
        if (!item) return;
        event.preventDefault();
        void handleSelect(item);
        break;
      }
    }
  }

  function matchResult(match: MatchSummary) {
    const hasLocalTeam =
      match.localTeamNum !== null && match.localTeamNum !== undefined;
    if (match.matchType === "training") {
      return { label: t("history:results.training"), tone: "text-accent-primary" };
    }
    if (hasLocalTeam && match.winnerTeamNum === match.localTeamNum) {
      return { label: t("history:results.win"), tone: "text-accent-success" };
    }
    if (
      hasLocalTeam &&
      match.winnerTeamNum !== null &&
      match.winnerTeamNum !== match.localTeamNum
    ) {
      return { label: t("history:results.loss"), tone: "text-accent-danger" };
    }
    if (match.winnerTeamNum === 0) {
      return { label: t("history:results.blueWon"), tone: "text-text-tertiary" };
    }
    if (match.winnerTeamNum === 1) {
      return { label: t("history:results.orangeWon"), tone: "text-text-tertiary" };
    }
    return { label: t("history:results.draw"), tone: "text-text-tertiary" };
  }

  function renderItem(item: PaletteItem, index: number) {
    const isActive = index === activeItemIndex;
    const rowClass = cn(
      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
      isActive ? "bg-surface-hover" : "hover:bg-surface-hover",
    );
    const chevronClass = cn(
      "shrink-0 text-text-tertiary",
      isActive ? "opacity-100" : "opacity-0",
    );
    const commonProps = {
      id: `command-palette-item-${index}`,
      type: "button" as const,
      role: "option" as const,
      "aria-selected": isActive,
      "data-active": isActive || undefined,
      onMouseEnter: () => setActiveIndex(index),
      onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
      onClick: () => void handleSelect(item),
      className: rowClass,
    };

    if (item.kind === "nav" || item.kind === "command") {
      const Icon = item.icon;
      return (
        <button key={item.id} {...commonProps}>
          <Icon size={16} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
            {item.label}
          </span>
          {item.kind === "command" ? (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t("common:commandPalette.actionTag", { defaultValue: "Acción" })}
            </span>
          ) : (
            <ArrowRight size={14} className={chevronClass} aria-hidden="true" />
          )}
        </button>
      );
    }

    if (item.kind === "player") {
      return (
        <button key={item.id} {...commonProps}>
          <Users size={16} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-text-primary">
              {item.player.name}
            </span>
            <span className="block truncate text-[11px] text-text-tertiary">
              {item.player.primary_id}
            </span>
          </span>
          <ArrowRight size={14} className={chevronClass} aria-hidden="true" />
        </button>
      );
    }

    const { label: resultLabel, tone: resultTone } = matchResult(item.match);
    const arenaName = item.match.arena ? getArenaDisplayName(item.match.arena) : null;
    const primaryTitle =
      arenaName ??
      (item.match.matchType === "training" ? t("history:titles.training") : "—");

    return (
      <button key={item.id} {...commonProps}>
        <History size={16} className="shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-text-primary">
            {primaryTitle}
          </span>
          <span className="block truncate text-[11px] text-text-tertiary">
            {formatDateTime(item.match.startTime * 1000)} ·{" "}
            <span className={resultTone}>{resultLabel}</span>
          </span>
        </span>
        <ArrowRight size={14} className={chevronClass} aria-hidden="true" />
      </button>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex animate-fade-in items-start justify-center px-4 pt-[12vh]"
      style={{ background: "var(--color-overlay)" }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("common:commandPalette.title", { defaultValue: "Paleta de comandos" })}
        className="w-full max-w-xl animate-scale-in overflow-hidden rounded-xl border border-border-default bg-bg-panel shadow-level-4"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-12 items-center gap-2.5 border-b border-border-subtle px-4">
          {commandMode ? (
            <Radio size={16} className="shrink-0 text-accent-primary" aria-hidden="true" />
          ) : (
            <Search size={16} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={
              activeItemIndex >= 0 ? `command-palette-item-${activeItemIndex}` : undefined
            }
            aria-label={t("common:commandPalette.searchLabel", { defaultValue: "Buscar" })}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={
              commandMode
                ? t("common:commandPalette.placeholderAction", {
                    defaultValue: "Buscar una acción…",
                  })
                : t("common:commandPalette.placeholder", {
                    defaultValue: "Buscar jugadores, partidas, acciones o ir a…",
                  })
            }
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          {search.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              aria-label={t("common:commandPalette.clear", { defaultValue: "Limpiar búsqueda" })}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <kbd className={KBD_CLASS}>Esc</kbd>
          )}
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="max-h-[55vh] overflow-y-auto py-1.5"
        >
          {isSearching && items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-text-tertiary">
              {t("common:commandPalette.searching", { defaultValue: "Buscando…" })}
            </div>
          ) : showEmpty ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Search size={18} className="text-text-tertiary" aria-hidden="true" />
              <p className="text-[13px] text-text-secondary">
                {t("common:commandPalette.empty", { defaultValue: "Sin resultados" })}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id}>
                {group.title && (
                  <div
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
                  >
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => renderItem(item, items.indexOf(item)))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border-subtle px-4 py-2 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASS}>↑</kbd>
            <kbd className={KBD_CLASS}>↓</kbd>
            {t("common:commandPalette.hintNavigate", { defaultValue: "Navegar" })}
          </span>
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASS}>↵</kbd>
            {t("common:commandPalette.hintOpen", { defaultValue: "Abrir" })}
          </span>
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASS}>&gt;</kbd>
            {t("common:commandPalette.hintAction", { defaultValue: "Acciones" })}
          </span>
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASS}>Esc</kbd>
            {t("common:commandPalette.hintClose", { defaultValue: "Cerrar" })}
          </span>
        </div>
      </div>
    </div>
  );
}
