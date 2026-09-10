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
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext } from "@/lib/shareContext";
import { useUIStore } from "@/stores/uiStore";
import type { MatchFilters, MatchSummary } from "@/lib/types";
import { Gamepad2, Share2, Dumbbell, AlertTriangle } from "lucide-react";

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
  const [viewTab, setViewTab] = useState<"matches" | "training" | "all">(
    initialFilters.matchType === "training" ? "training" : "matches",
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

  const [editingMatch, setEditingMatch] = useState<MatchSummary | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [editMatchType, setEditMatchType] = useState<string>("");
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

  const handleFiltersChange = useCallback(
    (newFilters: MatchFilters) => {
      setFilters(newFilters);
      const newParams = filtersToParams(newFilters);
      setSearchParams(newParams, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (editingMatch) {
      setEditMatchType(editingMatch.matchType ?? "");
      setEditPlaylist(editingMatch.playlist ?? "");
      setEditMood(editingMatch.mood ?? null);
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
    async (values: { matchType: string | null; playlist: string | null }) => {
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
        <Button
          variant="ghost"
          size="sm"
          leftIcon={Share2}
          onClick={handleShare}
          disabled={!shareContext || friendsLoading}
        >
          {t("common:buttons.share")}
        </Button>
      </div>

      <div className="border-b border-border-subtle pb-4">
        <FilterBar filters={filters} onChange={handleFiltersChange} />
      </div>

      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as typeof viewTab)}
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