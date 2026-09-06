import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatchDetail } from "@/hooks/useMatchDetail";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { useUpdateMatch } from "@/hooks/useUpdateMatch";
import { useDeleteMatch } from "@/hooks/useDeleteMatch";
import { useSetMatchMood } from "@/hooks/useSetMatchMood";
import { MoodPicker } from "@/components/mood/MoodPicker";
import { moodIcon, moodLabelKey, moodTone } from "@/lib/moods";
import { MatchHeader } from "@/components/match-detail/MatchHeader";
import { MatchInfoPanel } from "@/components/match-detail/MatchInfoPanel";
import { TeamRoster } from "@/components/match-detail/TeamRoster";
import { ScoreTimeline } from "@/components/match-detail/ScoreTimeline";
import { PlayerStatsTable } from "@/components/match-detail/PlayerStatsTable";
import { GoalDetail } from "@/components/match-detail/GoalDetail";
import { ShareModal } from "@/components/share/ShareModal";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { buildMatchShareContext } from "@/lib/shareContext";
import { Gamepad2, ArrowLeft, Pencil, Share2, Trash2 } from "lucide-react";

export function MatchDetailPage() {
  const { t, i18n } = useTranslation(["matchDetail", "history", "common", "mood"]);
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const id = Number(matchId);
  const { data, isLoading, isError, error, refetch } = useMatchDetail(id);
  const { data: friends } = useFriends();
  const { data: settings } = useSettings();
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMatchType, setEditMatchType] = useState("");
  const [editPlaylist, setEditPlaylist] = useState("");
  const [editMood, setEditMood] = useState<string | null>(null);
  const updateMutation = useUpdateMatch();
  const deleteMutation = useDeleteMatch();
  const moodMutation = useSetMatchMood();

  useEffect(() => {
    if (editing && data) {
      setEditMatchType(data.matchType ?? "");
      setEditPlaylist(data.playlist ?? "");
      setEditMood(data.mood ?? null);
    }
  }, [editing, data]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="mb-4">
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="mb-6 h-48 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="mt-6">
          <Skeleton className="h-80 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (isError || !data) {
    // Show what actually failed rather than a blanket "not found" — a command
    // error and a genuinely missing match need different fixes.
    const reason = isError && error instanceof Error ? error.message : null;

    return (
      <PageContainer>
        <EmptyState
          icon={Gamepad2}
          title={t("matchDetail:page.notFoundTitle")}
          description={reason ?? t("matchDetail:page.notFoundDescription")}
          actionLabel={t("matchDetail:page.backToHistory")}
          onAction={() => navigate("/history")}
        />
        {isError && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void refetch()}>
              {t("common:buttons.retry")}
            </Button>
          </div>
        )}
      </PageContainer>
    );
  }

  if (data.players.length === 0 && data.events.length === 0) {
    return (
      <PageContainer>
        <Button
          variant="ghost"
          leftIcon={ArrowLeft}
          onClick={() => navigate("/history")}
          className="mb-4"
        >
          {t("matchDetail:page.backToHistory")}
        </Button>
        <EmptyState
          icon={Gamepad2}
          title={t("matchDetail:page.noDataTitle")}
          description={t("matchDetail:page.noDataDescription")}
        />
      </PageContainer>
    );
  }

  const hasGoals = data.goals.length > 0;
  const goalsExist = data.events.some((e) => e.type === "GoalScored");

  const friendPrimaryIds = new Set(friends?.map((f) => f.primary_id) ?? []);
  const friendsInMatch = data.players
    .filter((p) => friendPrimaryIds.has(p.id))
    .map((p) => p.name);

  const shareContext = buildMatchShareContext(
    data,
    friendsInMatch,
    settings?.playerName ?? "Yo",
    settings?.localPrimaryId,
    i18n.language
  );

  const DetailMoodIcon = moodIcon(data.mood);

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

  const saveEdit = () => {
    updateMutation.mutate(
      {
        matchId: id,
        data: { matchType: editMatchType || null, playlist: editPlaylist || null },
      },
      { onSuccess: () => setEditing(false) }
    );
    moodMutation.mutate({ matchId: id, mood: editMood });
  };

  const confirmDelete = () => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeleting(false);
        navigate("/history");
      },
    });
  };

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          leftIcon={ArrowLeft}
          onClick={() => navigate("/history")}
        >
          {t("matchDetail:page.backToHistory")}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            leftIcon={Pencil}
            onClick={() => setEditing(true)}
            size="sm"
          >
            {t("matchDetail:page.editMatch")}
          </Button>
          <Button
            variant="ghost"
            leftIcon={Trash2}
            onClick={() => setDeleting(true)}
            size="sm"
            className="text-accent-danger hover:bg-accent-danger-subtle hover:text-accent-danger"
          >
            {t("matchDetail:page.deleteMatch")}
          </Button>
          <Button
            variant="secondary"
            leftIcon={Share2}
            onClick={() => setShareOpen(true)}
            size="sm"
          >
            {t("common:share.button", { defaultValue: "Compartir" })}
          </Button>
        </div>
      </div>

      {/* Share modal */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />

      {/* Edit modal */}
      <Modal
        isOpen={editing}
        onClose={() => setEditing(false)}
        title={t("history:modals.edit.title")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("common:buttons.cancel")}
            </Button>
            <Button variant="primary" onClick={saveEdit} isLoading={updateMutation.isPending}>
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
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        title={t("history:modals.delete.title")}
        description={t("history:modals.delete.description")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              {t("common:buttons.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={deleteMutation.isPending}>
              {t("common:buttons.delete")}
            </Button>
          </div>
        }
      />

      {/* Scoreboard first — it is what the page is about. */}
      <div className="animate-rise-in">
        <MatchHeader match={data} />
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        title={t("mood:editLabel")}
        className="flex items-center gap-2 self-start rounded-lg border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
      >
        <DetailMoodIcon size={16} className={moodTone(data.mood)} />
        <span>{t(moodLabelKey(data.mood))}</span>
      </button>

      {/* The two rosters share one flat surface, split by a hairline. */}
      <section className="grid divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-bg-surface lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <TeamRoster
          players={data.players}
          teamNum={0}
          teamName={t("matchDetail:teams.blueTeam")}
          teamColorClass="blue"
          playlist={data.playlist}
        />
        <TeamRoster
          players={data.players}
          teamNum={1}
          teamName={t("matchDetail:teams.orangeTeam")}
          teamColorClass="orange"
          playlist={data.playlist}
        />
      </section>

      {/* Full comparison table. */}
      <div>
        <PlayerStatsTable players={data.players} />
      </div>

      {/* Then the story of the match: goals, then the timeline. */}
      {hasGoals && <GoalDetail goals={data.goals} />}

      {goalsExist && (
        <ScoreTimeline
          events={data.events}
          team0Name={t("matchDetail:teams.blue")}
          team1Name={t("matchDetail:teams.orange")}
        />
      )}

      {/* Match metadata last — reference detail, not headline. */}
      <MatchInfoPanel match={data} />

    </PageContainer>
  );
}
