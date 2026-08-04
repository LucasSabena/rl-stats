import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { usePlayerDirectory } from "@/hooks/usePlayerDirectory";
import { useFriends } from "@/hooks/useFriends";
import { useAddFriend, useRemoveFriend } from "@/hooks/useFriends";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Shield, Swords, Search, Users, UserPlus, UserMinus } from "lucide-react";

export function PlayerDirectoryPage() {
  const { t } = useTranslation(["players", "common"]);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [relationship, setRelationship] = useState("");
  const [sortBy, setSortBy] = useState("matches");

  const { data: players, isLoading } = usePlayerDirectory({
    search: search || undefined,
    relationship: relationship || undefined,
    sortBy,
  });

  const { data: friends } = useFriends();
  const addFriend = useAddFriend();
  const removeFriend = useRemoveFriend();

  const friendIds = new Set(friends?.map((f) => f.player_id) ?? []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  return (
    <PageContainer>
      <h2 className="text-2xl font-bold text-text-primary">{t("players:directory.title")}</h2>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1.5 block text-xs font-semibold text-text-tertiary">
            {t("players:directory.searchLabel")}
          </label>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder={t("players:directory.searchPlaceholder")}
              className="w-full rounded-md border border-border-subtle bg-bg-base py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
            />
          </div>
        </div>

        <Select
          value={relationship}
          onChange={setRelationship}
          options={[
            { value: "", label: t("players:directory.filterAll") },
            { value: "teammate", label: t("players:directory.filterTeammates") },
            { value: "opponent", label: t("players:directory.filterOpponents") },
          ]}
        />

        <Select
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "matches", label: t("players:directory.sortMostMatches") },
            { value: "recent", label: t("players:directory.sortRecent") },
            { value: "wins_together", label: t("players:directory.sortMostWinsTogether") },
            { value: "wins_against", label: t("players:directory.sortMostWinsAgainst") },
          ]}
        />
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && players && players.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("players:directory.emptyTitle")}
          description={t("players:directory.emptyDescription")}
        />
      )}

      {players && players.length > 0 && (
        <div className="space-y-2">
          {players.map((p) => {
            const isFriend = friendIds.has(p.player_id);
            return (
              <Card
                key={p.player_id}
                className="cursor-pointer transition-all hover:shadow-level-2"
                onClick={() => navigate(`/players/${p.player_id}`)}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Name + badge */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-text-primary">
                        {p.name}
                      </p>
                      {isFriend && (
                        <span className="shrink-0 rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] font-bold text-accent-primary">
                          {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                        </span>
                      )}
                      {p.matches_as_teammate === 0 && (
                        <span className="shrink-0 rounded-full bg-accent-danger/15 px-2 py-0.5 text-[10px] font-bold text-accent-danger">
                          {t("players:directory.badgeSoloRival")}
                        </span>
                      )}
                      {p.matches_as_opponent === 0 && (
                        <span className="shrink-0 rounded-full bg-accent-success/15 px-2 py-0.5 text-[10px] font-bold text-accent-success">
                          {t("players:directory.badgeSoloTeammate")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t("players:directory.matchCount", { count: p.total_matches })}
                      {" · "}
                      {p.matches_as_teammate} {t("players:directory.teammateShort")} · {p.matches_as_opponent} {t("players:directory.opponentShort")}
                      {" · "}
                      {t("players:directory.firstSeen")}{" "}
                      {new Date(p.first_seen).toLocaleDateString(i18n.language, {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Stats columns */}
                  <div className="hidden flex-col items-center gap-0.5 sm:flex">
                    <Shield size={13} className="text-accent-secondary/70" />
                    <span className="text-xs text-text-secondary">
                      {p.wins_together}-{p.losses_together}
                    </span>
                    <span className="text-[10px] text-text-tertiary">{t("players:directory.together")}</span>
                  </div>
                  <div className="hidden flex-col items-center gap-0.5 sm:flex">
                    <Swords size={13} className="text-accent-danger/70" />
                    <span className="text-xs text-text-secondary">
                      {p.wins_against}-{p.losses_against}
                    </span>
                    <span className="text-[10px] text-text-tertiary">{t("players:directory.versus")}</span>
                  </div>

                  <Button
                    variant={isFriend ? "danger" : "ghost"}
                    size="sm"
                    leftIcon={isFriend ? UserMinus : UserPlus}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFriend) removeFriend.mutate(p.player_id);
                      else addFriend.mutate({ playerId: p.player_id, tag: p.name });
                    }}
                    isLoading={
                      (addFriend.isPending && addFriend.variables?.playerId === p.player_id) ||
                      (removeFriend.isPending && removeFriend.variables === p.player_id)
                    }
                  />
                  <ArrowRight size={16} className="text-text-tertiary" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
