import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { useDeleteMatch } from "@/hooks/useDeleteMatch";
import { useUpdateMatch } from "@/hooks/useUpdateMatch";
import { useDailyRollups } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { MatchList } from "@/components/history/MatchList";
import { FilterBar } from "@/components/history/FilterBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext } from "@/lib/shareContext";
import type { MatchFilters, MatchSummary } from "@/lib/types";
import { Gamepad2, Share2 } from "lucide-react";

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
  const { t, i18n } = useTranslation(["history", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = paramsToFilters(searchParams);
  const [filters, setFilters] = useState<MatchFilters>(initialFilters);

  const { data, isLoading, isError } = useMatchHistory(filters);

  const [editingMatch, setEditingMatch] = useState<MatchSummary | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);

  const [editMatchType, setEditMatchType] = useState<string>("");
  const [editPlaylist, setEditPlaylist] = useState<string>("");

  const deleteMutation = useDeleteMatch();
  const updateMutation = useUpdateMatch();

  const matchTypeOptions: { value: string; label: string }[] = [
    { value: "ranked", label: t("history:matchTypes.ranked") },
    { value: "casual", label: t("history:matchTypes.casual") },
    { value: "tournament", label: t("history:matchTypes.tournament") },
    { value: "other", label: t("history:matchTypes.other") },
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
    }
  }, [editingMatch]);

  const handleDelete = (matchId: number) => setDeletingMatchId(matchId);

  const confirmDelete = () => {
    if (deletingMatchId) {
      deleteMutation.mutate(deletingMatchId);
      setDeletingMatchId(null);
    }
  };

  const handleEdit = (match: MatchSummary) => setEditingMatch(match);

  const saveEdit = (data: { matchType: string | null; playlist: string | null }) => {
    if (editingMatch) {
      updateMutation.mutate({ matchId: editingMatch.id, data });
      setEditingMatch(null);
    }
  };


  const [shareOpen, setShareOpen] = useState(false);

  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: settings } = useSettings();
  const { data: rollupsData } = useDailyRollups("week");

  const friendsPresent = useMemo(() => friends?.map((f) => f.name) ?? [], [friends]);
  const username = settings?.playerName ?? "Yo";

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
          {data && data.length > 0 && (
            <p className="mt-1 text-xs text-text-tertiary">
              {t("history:summary.count", { count: data.length })}
              {" · "}
              <span className="text-accent-success">
                {t("history:summary.wins", { count: data.filter((m) => m.localTeamNum !== null && m.winnerTeamNum === m.localTeamNum).length })}
              </span>
              {" – "}
              <span className="text-accent-danger">
                {t("history:summary.losses", { count: data.filter((m) => m.localTeamNum !== null && m.winnerTeamNum !== null && m.winnerTeamNum !== m.localTeamNum).length })}
              </span>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={Share2}
          onClick={() => setShareOpen(true)}
          disabled={!shareContext || friendsLoading}
        >
          {t("common:buttons.share", { defaultValue: "Compartir" })}
        </Button>
      </div>

      <div className="border-b border-border-subtle pb-4">
        <FilterBar filters={filters} onChange={handleFiltersChange} />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={Gamepad2}
          title={t("history:errors.loadFailed.title")}
          description={t("history:errors.loadFailed.description")}
        />
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <EmptyState
          icon={Gamepad2}
          title={t("history:empty.noMatches.title")}
          description={t("history:empty.noMatches.description")}
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <MatchList
          matches={data}
          onEditMatch={handleEdit}
          onDeleteMatch={handleDelete}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deletingMatchId !== null}
        onClose={() => setDeletingMatchId(null)}
        title={t("history:modals.delete.title")}
        description={t("history:modals.delete.description")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeletingMatchId(null)}>
              {t("common:buttons.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={deleteMutation.isPending}>
              {t("common:buttons.delete")}
            </Button>
          </div>
        }
      >
        <></>
      </Modal>

      {/* Edit modal */}
      <Modal
        isOpen={editingMatch !== null}
        onClose={() => setEditingMatch(null)}
        title={t("history:modals.edit.title")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingMatch(null)}>
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
              isLoading={updateMutation.isPending}
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
        </div>
      </Modal>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />
    </PageContainer>
  );
}