import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { useDeleteMatch } from "@/hooks/useDeleteMatch";
import { useUpdateMatch } from "@/hooks/useUpdateMatch";
import { useSetMatchMood } from "@/hooks/useSetMatchMood";
import { useDailyRollups } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { MatchList } from "@/components/history/MatchList";
import { FilterBar } from "@/components/history/FilterBar";
import { MoodPicker } from "@/components/mood/MoodPicker";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { TagInput } from "@/components/ui/TagInput";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext } from "@/lib/shareContext";
import { exportHistoryCsv } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import type { MatchFilters, MatchSummary } from "@/lib/types";
import { Gamepad2, Share2, Dumbbell, AlertTriangle, Download, CheckSquare, X, Tag } from "lucide-react";

function toISODate(ts?: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function filtersToParams(filters: MatchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.result) params.set("result", filters.result);
  if (filters.matchType) params.set("type", filters.matchType);
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.dateFrom) params.set("from", String(filters.dateFrom));
  if (filters.dateTo) params.set("to", String(filters.dateTo));
  return params;
}

function paramsToFilters(params: URLSearchParams): MatchFilters {
  const filters: MatchFilters = {};
  const search = params.get("search");
  const result = params.get("result") as "win" | "loss" | null;
  const type = params.get("type");
  const mode = params.get("mode");
  const from = params.get("from");
  const to = params.get("to");

  if (search) filters.search = search;
  if (result === "win" || result === "loss") filters.result = result;
  if (type) filters.matchType = type as MatchFilters["matchType"];
  if (mode) filters.mode = mode;
  if (from) filters.dateFrom = Number(from);
  if (to) filters.dateTo = Number(to);

  return filters;
}

export function HistoryPage() {
  const { t, i18n } = useTranslation(["history", "common", "mood"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = paramsToFilters(searchParams);
  const [filters, setFilters] = useState<MatchFilters>(initialFilters);
  const initialTab = searchParams.get("tab");
  const [viewTab, setViewTab] = useState<"matches" | "training" | "all">(
    initialTab === "training" || initialTab === "all"
      ? initialTab
      : initialFilters.matchType === "training"
        ? "training"
        : "matches",
  );

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMatchHistory(filters);

  const addToast = useUIStore((state) => state.addToast);

  const matches = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Tabs: "matches" hides training rows, "training" shows only those and
  // "all" shows everything. Training rows are matched by the stored
  // match_type ("training") the backend assigns to solo sessions.
  const visibleData = useMemo(() => {
    if (viewTab === "training") {
      return matches.filter((m) => m.matchType === "training");
    }
    if (viewTab === "matches") {
      return matches.filter((m) => m.matchType !== "training");
    }
    return matches;
  }, [matches, viewTab]);

  const trainingCount = useMemo(
    () => matches.filter((m) => m.matchType === "training").length,
    [matches],
  );

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchSummary | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [editMatchType, setEditMatchType] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editPlaylist, setEditPlaylist] = useState<string>("");
  const [editMood, setEditMood] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const { mutate: deleteMatch, isPending: isDeleting } = useDeleteMatch();
  const { mutateAsync: updateMatchAsync, isPending: isUpdating } = useUpdateMatch();
  const { mutateAsync: setMatchMoodAsync, isPending: isSettingMood } = useSetMatchMood();

  const matchTypeOptions: { value: string; label: string }[] = [
    { value: "ranked", label: t("history:matchTypes.ranked") },
    { value: "casual", label: t("history:matchTypes.casual") },
    { value: "tournament", label: t("history:matchTypes.tournament") },
    { value: "other", label: t("history:matchTypes.other") },
    { value: "training", label: t("history:results.training") },
  ];

  const playlistOptions: { value: string; label: string }[] = [
    { value: "Duel", label: t("history:playlists.duel") },
    { value: "Doubles", label: t("history:playlists.doubles") },
    { value: "Standard", label: t("history:playlists.standard") },
    { value: "Chaos", label: t("history:playlists.chaos") },
    { value: "Other", label: t("history:playlists.other") },
  ];

  const toggleSelected = useCallback((matchId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  type BulkSnapshot = Map<
    number,
    { matchType: string | null; playlist: string | null; tags: string[] }
  >;

  const applyBulkUpdate = useCallback(
    async (
      patch: { matchType?: string; playlist?: string; tag?: string },
      successTitle: string
    ) => {
      if (selectedIds.size === 0) return;
      const snapshot: BulkSnapshot = new Map();
      setBulkBusy(true);
      try {
        for (const id of selectedIds) {
          const match = matches.find((entry) => entry.id === id);
          if (!match) continue;
          snapshot.set(id, {
            matchType: match.matchType ?? null,
            playlist: match.playlist ?? null,
            tags: match.tags ?? [],
          });
          const nextTags = patch.tag
            ? Array.from(new Set([...(match.tags ?? []), patch.tag]))
            : null;
          await updateMatchAsync({
            matchId: id,
            data: {
              matchType:
                patch.matchType !== undefined
                  ? patch.matchType
                  : (match.matchType ?? null),
              playlist:
                patch.playlist !== undefined
                  ? patch.playlist
                  : (match.playlist ?? null),
              tags: nextTags ?? undefined,
            },
          });
        }
        addToast({
          type: "success",
          title: successTitle,
          message: t("history:bulk.applied", { count: snapshot.size }),
          action: {
            label: t("common:actions.undo"),
            onClick: () => {
              void (async () => {
                for (const [id, previous] of snapshot) {
                  await updateMatchAsync({
                    matchId: id,
                    data: {
                      matchType: previous.matchType,
                      playlist: previous.playlist,
                      tags: previous.tags,
                    },
                  });
                }
              })();
            },
          },
        });
      } catch {
        addToast({ type: "error", title: t("history:toasts.editError") });
      } finally {
        setBulkBusy(false);
      }
    },
    [addToast, matches, selectedIds, t, updateMatchAsync]
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      for (const id of selectedIds) {
        await new Promise<void>((resolve, reject) => {
          deleteMatch(id, {
            onSuccess: () => resolve(),
            onError: (error) => reject(error),
          });
        });
      }
      addToast({
        type: "success",
        title: t("history:bulk.deleted", { count: selectedIds.size }),
      });
      exitSelection();
    } catch {
      addToast({ type: "error", title: t("history:toasts.deleteError") });
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  }, [addToast, deleteMatch, exitSelection, selectedIds, t]);

  const handleFiltersChange = useCallback(
    (newFilters: MatchFilters) => {
      setFilters(newFilters);
      const newParams = filtersToParams(newFilters);
      if (viewTab !== "matches") newParams.set("tab", viewTab);
      setSearchParams(newParams, { replace: true });
    },
    [setSearchParams, viewTab]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      const next = tab as typeof viewTab;
      setViewTab(next);
      const newParams = filtersToParams(filters);
      if (next !== "matches") newParams.set("tab", next);
      setSearchParams(newParams, { replace: true });
    },
    [filters, setSearchParams]
  );

  useEffect(() => {
    if (editingMatch) {
      setEditMatchType(editingMatch.matchType ?? "");
      setEditPlaylist(editingMatch.playlist ?? "");
      setEditMood(editingMatch.mood ?? null);
      setEditNotes(editingMatch.notes ?? "");
      setEditTags(editingMatch.tags ?? []);
      setEditError(null);
    }
  }, [editingMatch]);

  const handleDelete = useCallback((matchId: number) => setDeletingMatchId(matchId), []);

  const cancelDelete = useCallback(() => setDeletingMatchId(null), []);

  const confirmDelete = useCallback(() => {
    if (deletingMatchId === null) return;
    deleteMatch(deletingMatchId, {
      onSuccess: () => {
        setDeletingMatchId(null);
        addToast({ type: "success", title: t("history:toasts.deleted") });
      },
      onError: (error) => {
        addToast({
          type: "error",
          title: t("history:toasts.deleteError"),
          message: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }, [deletingMatchId, deleteMatch, addToast, t]);

  const handleEdit = useCallback((match: MatchSummary) => setEditingMatch(match), []);

  const closeEdit = useCallback(() => setEditingMatch(null), []);

  const saveEdit = useCallback(
    async (values: {
      matchType: string | null;
      playlist: string | null;
      notes: string | null;
      tags: string[];
    }) => {
      if (!editingMatch) return;
      setEditError(null);
      try {
        await updateMatchAsync({ matchId: editingMatch.id, data: values });
        await setMatchMoodAsync({ matchId: editingMatch.id, mood: editMood });
        setEditingMatch(null);
      } catch (error) {
        // Keep the dialog open so the failure is visible instead of silently
        // dropping the mood while the rest of the edit looks saved.
        setEditError(error instanceof Error ? error.message : String(error));
      }
    },
    [editingMatch, updateMatchAsync, setMatchMoodAsync, editMood],
  );

  const handleShare = useCallback(() => setShareOpen(true), []);

  const closeShare = useCallback(() => setShareOpen(false), []);

  const [exportingCsv, setExportingCsv] = useState(false);

  // Vim-style j/k navigation over the visible match rows. Enter/Space already
  // open a row (MatchCard handles them), so this only moves focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"]')) return;

      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-history-match]"),
      );
      if (rows.length === 0) return;
      event.preventDefault();

      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? rows.indexOf(active) : -1;
      const nextIndex =
        key === "j"
          ? Math.min(rows.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      const next = rows[nextIndex];
      next?.focus();
      next?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleExportCsv = useCallback(async () => {
    try {
      setExportingCsv(true);
      const csv = await exportHistoryCsv(filters);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `rl-stats-historial-${stamp}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      addToast({
        type: "success",
        title: t("history:export.success", { defaultValue: "Historial exportado a CSV" }),
      });
    } catch {
      addToast({
        type: "error",
        title: t("history:export.error", { defaultValue: "No se pudo exportar el CSV" }),
      });
    } finally {
      setExportingCsv(false);
    }
  }, [filters, addToast, t]);

  const hasActiveFilters = Boolean(
    filters.search ||
      filters.result ||
      filters.matchType ||
      filters.mode ||
      filters.dateFrom ||
      filters.dateTo,
  );

  const clearFilters = useCallback(() => handleFiltersChange({}), [handleFiltersChange]);

  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: settings } = useSettings();
  const { data: rollupsData } = useDailyRollups("week");

  const friendsPresent = useMemo(() => friends?.map((f) => f.name) ?? [], [friends]);
  const username = settings?.playerName ?? t("common:self");

  const shareDate = useMemo(() => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom === filters.dateTo) {
      return toISODate(filters.dateFrom);
    }
    return toISODate(Date.now());
  }, [filters]);

  const shareContext = useMemo(() => {
    if (!rollupsData || rollupsData.length === 0) return null;
    const rollup = rollupsData.find((r) => r.date === shareDate) || rollupsData[0];
    if (!rollup) return null;
    return buildDayShareContext(rollup, friendsPresent, username, i18n.language);
  }, [rollupsData, shareDate, friendsPresent, username, i18n.language]);

  return (
    <PageContainer>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">
            {t("history:pageTitle")}
          </h2>
          {visibleData && visibleData.length > 0 && (
            <p className="mt-1 text-xs text-text-tertiary">
              {t("history:summary.count", { count: visibleData.filter((m) => m.matchType !== "training").length })}
              {" · "}
              <span className="text-accent-success">
                {t("history:summary.wins", { count: visibleData.filter((m) => m.localTeamNum !== null && m.winnerTeamNum === m.localTeamNum).length })}
              </span>
              {" – "}
              <span className="text-accent-danger">
                {t("history:summary.losses", { count: visibleData.filter((m) => m.localTeamNum !== null && m.winnerTeamNum !== null && m.winnerTeamNum !== m.localTeamNum).length })}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Download}
            onClick={() => void handleExportCsv()}
            disabled={exportingCsv || visibleData.length === 0}
          >
            {t("history:export.button", { defaultValue: "Exportar CSV" })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Share2}
            onClick={handleShare}
            disabled={!shareContext || friendsLoading}
          >
            {t("common:buttons.share")}
          </Button>
          <Button
            variant={selectionMode ? "secondary" : "ghost"}
            size="sm"
            leftIcon={CheckSquare}
            onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
            disabled={visibleData.length === 0}
          >
            {selectionMode
              ? t("history:bulk.cancel", { defaultValue: "Cancelar" })
              : t("history:bulk.select", { defaultValue: "Seleccionar" })}
          </Button>
        </div>
      </div>

      <div className="border-b border-border-subtle pb-4">
        <FilterBar filters={filters} onChange={handleFiltersChange} />
      </div>

      <Tabs
        value={viewTab}
        onValueChange={handleTabChange}
        className="gap-0"
      >
        <TabsList>
          <TabsTrigger value="matches">{t("history:tabs.matches")}</TabsTrigger>
          <TabsTrigger value="training">
            <span className="inline-flex items-center gap-1.5">
              <Dumbbell size={13} />
              {t("history:tabs.training")}
              {trainingCount > 0 && (
                <span className="rounded-full bg-accent-primary/15 px-1.5 text-[10px] font-bold text-accent-primary">
                  {trainingCount}
                </span>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="all">{t("history:tabs.all")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          title={t("history:errors.loadFailed.title")}
          description={t("history:errors.loadFailed.description")}
          actionLabel={t("common:buttons.retry")}
          onAction={() => void refetch()}
        />
      )}

      {!isLoading && !isError && visibleData.length === 0 && (
        <EmptyState
          icon={viewTab === "training" ? Dumbbell : Gamepad2}
          title={
            viewTab === "training"
              ? t("history:empty.noTraining.title")
              : hasActiveFilters
                ? t("history:empty.filtered.title")
                : t("history:empty.noMatches.title")
          }
          description={
            viewTab === "training"
              ? t("history:empty.noTraining.description")
              : hasActiveFilters
                ? t("history:empty.filtered.description")
                : t("history:empty.noMatches.description")
          }
          actionLabel={hasActiveFilters ? t("history:filters.clearAll") : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      )}

      {!isLoading && !isError && visibleData.length > 0 && (
        <div className="space-y-6">
          <MatchList
            matches={visibleData}
            onEditMatch={handleEdit}
            onDeleteMatch={handleDelete}
            selectable={selectionMode}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
          />
          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void fetchNextPage()}
                isLoading={isFetchingNextPage}
              >
                {t("history:loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 animate-slide-in-up">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-default bg-bg-elevated px-4 py-3 shadow-level-4">
            <span className="text-sm font-semibold text-text-primary">
              {t("history:bulk.selected", {
                count: selectedIds.size,
                defaultValue: "{{count}} seleccionadas",
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelectedIds(
                  selectedIds.size === visibleData.length
                    ? new Set()
                    : new Set(visibleData.map((m) => m.id))
                )
              }
            >
              {selectedIds.size === visibleData.length
                ? t("history:bulk.clear", { defaultValue: "Limpiar" })
                : t("history:bulk.selectAll", { defaultValue: "Seleccionar todo" })}
            </Button>

            <div className="h-5 w-px bg-border-subtle" aria-hidden="true" />

            <Select
              size="sm"
              value=""
              onChange={(value) => {
                if (!value) return;
                void applyBulkUpdate(
                  { matchType: value },
                  t("history:bulk.typeChanged", {
                    defaultValue: "Tipo de partida actualizado",
                  })
                );
              }}
              options={[
                {
                  value: "",
                  label: t("history:bulk.changeType", { defaultValue: "Cambiar tipo…" }),
                },
                ...matchTypeOptions,
              ]}
              disabled={bulkBusy || selectedIds.size === 0}
            />

            <Select
              size="sm"
              value=""
              onChange={(value) => {
                if (!value) return;
                void applyBulkUpdate(
                  { playlist: value },
                  t("history:bulk.playlistChanged", {
                    defaultValue: "Playlist actualizada",
                  })
                );
              }}
              options={[
                {
                  value: "",
                  label: t("history:bulk.changePlaylist", {
                    defaultValue: "Cambiar playlist…",
                  }),
                },
                ...playlistOptions,
              ]}
              disabled={bulkBusy || selectedIds.size === 0}
            />

            <div className="flex min-w-[180px] flex-1 items-center gap-2">
              <TagInput
                value={bulkTag ? [bulkTag] : []}
                onChange={(tags) => setBulkTag(tags[0] ?? "")}
                placeholder={t("history:bulk.tagPlaceholder", {
                  defaultValue: "Etiqueta…",
                })}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!bulkTag || bulkBusy || selectedIds.size === 0}
                onClick={() =>
                  void applyBulkUpdate(
                    { tag: bulkTag },
                    t("history:bulk.tagged", { defaultValue: "Etiqueta aplicada" })
                  ).then(() => setBulkTag(""))
                }
              >
                <Tag size={13} />
              </Button>
            </div>

            <Button
              variant="danger"
              size="sm"
              disabled={bulkBusy || selectedIds.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              {t("common:buttons.delete")}
            </Button>
            <Button variant="ghost" size="sm" onClick={exitSelection}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => void handleBulkDelete()}
        title={t("history:bulk.deleteTitle", { defaultValue: "Borrar partidas" })}
        description={t("history:bulk.deleteConfirm", {
          count: selectedIds.size,
          defaultValue: "Se van a borrar {{count}} partidas. Esta acción no se puede deshacer.",
        })}
        confirmLabel={t("common:buttons.delete")}
        variant="danger"
        isPending={bulkBusy}
      />

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deletingMatchId !== null}
        onClose={cancelDelete}
        title={t("history:modals.delete.title")}
        description={t("history:modals.delete.description")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelDelete}>
              {t("common:buttons.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>
              {t("common:buttons.delete")}
            </Button>
          </div>
        }
      />

      {/* Edit modal */}
      <Modal
        isOpen={editingMatch !== null}
        onClose={closeEdit}
        title={t("history:modals.edit.title")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeEdit}>
              {t("common:buttons.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                saveEdit({
                  matchType: editMatchType || null,
                  playlist: editPlaylist || null,
                  notes: editNotes.trim() ? editNotes.trim() : null,
                  tags: editTags,
                })
              }
              isLoading={isUpdating || isSettingMood}
            >
              {t("common:buttons.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">{t("history:modals.edit.matchTypeLabel")}</label>
            <Select
              value={editMatchType || ""}
              onChange={(val) => setEditMatchType(val)}
              options={[{ value: "", label: "—" }, ...matchTypeOptions]}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">{t("history:modals.edit.playlistLabel")}</label>
            <Select
              value={editPlaylist || ""}
              onChange={(val) => setEditPlaylist(val)}
              options={[{ value: "", label: "—" }, ...playlistOptions]}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">{t("mood:editLabel")}</label>
            <MoodPicker value={editMood} onChange={setEditMood} size="sm" />
          </div>
          <div>
            <label
              htmlFor="match-notes"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              {t("history:modals.edit.notesLabel", { defaultValue: "Notas" })}
            </label>
            <textarea
              id="match-notes"
              rows={3}
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              placeholder={t("history:modals.edit.notesPlaceholder", {
                defaultValue: "¿Qué querés recordar de esta partida?",
              })}
              className="w-full resize-none rounded-lg border border-border-subtle bg-bg-panel px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              {t("history:modals.edit.tagsLabel", { defaultValue: "Etiquetas" })}
            </label>
            <TagInput
              value={editTags}
              onChange={setEditTags}
              placeholder={t("history:modals.edit.tagsPlaceholder", {
                defaultValue: "torneo, ranked, con amigos…",
              })}
            />
          </div>
          {editError && (
            <p className="text-xs text-accent-danger">{editError}</p>
          )}
        </div>
      </Modal>

      <ShareModal
        isOpen={shareOpen}
        onClose={closeShare}
        context={shareContext}
      />
    </PageContainer>
  );
}