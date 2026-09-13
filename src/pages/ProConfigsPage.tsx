import { useState, useMemo, useId, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { proPlayers } from "@/data/proConfigs";
import { ProPlayerCard } from "@/components/pro-configs/ProPlayerCard";
import { ProPlayerAvatar } from "@/components/pro-configs/ProPlayerAvatar";
import { PageContainer } from "@/components/layout/PageContainer";
import type { ProPlayer, Continent } from "@/lib/proConfigsTypes";
import { Search, ChevronDown, ChevronRight, Globe, Star } from "lucide-react";

const continentOrder: Continent[] = ["Europe", "North America", "South America", "MENA", "Oceania", "Asia-Pacific", "Sub-Saharan Africa"];

const continentFlags: Record<Continent, string> = {
  "Europe": "🇪🇺",
  "North America": "🇺🇸",
  "South America": "🇧🇷",
  "MENA": "🇸🇦",
  "Oceania": "🇦🇺",
  "Asia-Pacific": "🇯🇵",
  "Sub-Saharan Africa": "🇿🇦",
};

const continentKeys: Record<Continent, string> = {
  "Europe": "europe",
  "North America": "northAmerica",
  "South America": "southAmerica",
  "MENA": "mena",
  "Oceania": "oceania",
  "Asia-Pacific": "asiaPacific",
  "Sub-Saharan Africa": "subSaharanAfrica",
};

function groupByContinentAndTeam(players: ProPlayer[]) {
  const map = new Map<Continent, Map<string, ProPlayer[]>>();
  for (const c of continentOrder) {
    map.set(c, new Map());
  }
  for (const player of players) {
    const continentMap = map.get(player.continent) ?? new Map();
    const teamPlayers = continentMap.get(player.team) ?? [];
    teamPlayers.push(player);
    continentMap.set(player.team, teamPlayers);
    if (!map.has(player.continent)) {
      map.set(player.continent, continentMap);
    }
  }
  return map;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const PLAYER_BY_SLUG = new Map(proPlayers.map((player) => [slugify(player.name), player]));

const PRO_FAVORITES_KEY = "rl-pro-favorites";

function readProFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(PRO_FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function ProConfigsPage() {
  const { t } = useTranslation(["proConfigs", "common"]);
  const baseId = useId();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [search, setSearch] = useState("");
  const [expandedContinents, setExpandedContinents] = useState<Set<Continent>>(new Set(["Europe", "North America"]));
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(() => readProFavorites());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const selectedPlayer = slug ? (PLAYER_BY_SLUG.get(slug) ?? null) : null;

  const selectPlayer = useCallback(
    (player: ProPlayer) => {
      navigate(`/pro-configs/${slugify(player.name)}`);
    },
    [navigate]
  );

  const toggleFavorite = useCallback((player: ProPlayer) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = slugify(player.name);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(PRO_FAVORITES_KEY, JSON.stringify([...next]));
      } catch {
        // Favorites are a convenience; ignore storage failures.
      }
      return next;
    });
  }, []);

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) {
      return favoritesOnly
        ? proPlayers.filter((player) => favorites.has(slugify(player.name)))
        : proPlayers;
    }
    const q = search.toLowerCase();
    return proPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.fullName && p.fullName.toLowerCase().includes(q)) ||
        p.team.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q)
    );
  }, [favorites, favoritesOnly, search]);

  const grouped = useMemo(() => groupByContinentAndTeam(filteredPlayers), [filteredPlayers]);

  const toggleContinent = (c: Continent) => {
    setExpandedContinents((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleTeam = (team: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  return (
    <PageContainer>
      <div className="flex gap-6" style={{ minHeight: "calc(100vh - 12rem)" }}>
        {/* Sidebar list */}
        <div className="w-72 shrink-0 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated p-3">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder={t("proConfigs:search.placeholder")}
              aria-label={t("proConfigs:search.label")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-base py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setFavoritesOnly((value) => !value)}
            aria-pressed={favoritesOnly}
            className={
              favoritesOnly
                ? "mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent-warning/40 bg-accent-warning/10 px-2 py-1.5 text-xs font-semibold text-accent-warning"
                : "mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border-subtle px-2 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary"
            }
          >
            <Star
              size={12}
              className={favoritesOnly ? "fill-accent-warning" : ""}
            />
            {t("proConfigs:favorites.only", { defaultValue: "Solo favoritos" })}
            {favorites.size > 0 && ` (${favorites.size})`}
          </button>

        {continentOrder.map((continent) => {
          const continentTeams = grouped.get(continent);
          if (!continentTeams || continentTeams.size === 0) return null;
          const teams = [...continentTeams.entries()];
          const continentPanelId = `${baseId}-${continentKeys[continent]}-panel`;

          return (
            <div key={continent} className="mb-2">
              <button
                onClick={() => toggleContinent(continent)}
                aria-expanded={expandedContinents.has(continent)}
                aria-controls={continentPanelId}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-text-primary hover:bg-surface-hover"
              >
                {expandedContinents.has(continent) ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span>{continentFlags[continent]}</span>
                <span>{t(`proConfigs:continents.${continentKeys[continent]}`)}</span>
              </button>

              {expandedContinents.has(continent) && (
                <div id={continentPanelId} className="ml-4 mt-1">
                  {teams.map(([team, players], teamIndex) => {
                    const teamPanelId = `${baseId}-${continentKeys[continent]}-team-${teamIndex}-panel`;
                    return (
                    <div key={team}>
                      <button
                        onClick={() => toggleTeam(team)}
                        aria-expanded={expandedTeams.has(team)}
                        aria-controls={teamPanelId}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        {expandedTeams.has(team) ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                        <span className="truncate">{team}</span>
                        <span className="ml-auto text-xs text-text-tertiary">{players.length}</span>
                      </button>

                      {expandedTeams.has(team) && (
                        <div id={teamPanelId} className="ml-5">
                          {players.map((player) => (
                            <button
                              key={player.name}
                              onClick={() => selectPlayer(player)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors ${
                                selectedPlayer?.name === player.name
                                  ? "bg-accent-primary/10 text-accent-primary"
                                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                              }`}
                            >
                              {player.imageUrl ? (
                                <ProPlayerAvatar player={player} size="sm" />
                              ) : (
                                <span className={`inline-block h-2 w-2 rounded-full ${
                                  player.camera ? "bg-accent-success" : "bg-text-tertiary"
                                }`} />
                              )}
                              <span className="truncate">{player.name}</span>
                              <span
                                role="button"
                                tabIndex={-1}
                                aria-label={
                                  favorites.has(slugify(player.name))
                                    ? t("proConfigs:favorites.remove", {
                                        defaultValue: "Quitar de favoritos",
                                      })
                                    : t("proConfigs:favorites.add", {
                                        defaultValue: "Agregar a favoritos",
                                      })
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleFavorite(player);
                                }}
                                className={
                                  favorites.has(slugify(player.name))
                                    ? "rounded p-0.5 text-accent-warning"
                                    : "rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-accent-warning focus:opacity-100 group-hover/player:opacity-100"
                                }
                              >
                                <Star
                                  size={11}
                                  className={
                                    favorites.has(slugify(player.name))
                                      ? "fill-accent-warning"
                                      : ""
                                  }
                                />
                              </span>
                              <span className="ml-auto text-xs text-text-tertiary">{player.nationality}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredPlayers.length === 0 && (
          <p className="px-2 py-3 text-sm text-text-tertiary">
            {t("proConfigs:search.noResults")}
          </p>
        )}
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {selectedPlayer ? (
          <ProPlayerCard player={selectedPlayer} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <Globe size={48} className="mb-4 text-text-tertiary" />
            <h3 className="text-lg font-semibold text-text-secondary">
              {t("proConfigs:emptyState.title")}
            </h3>
            <p className="mt-2 max-w-md text-sm text-text-tertiary">
              {t("proConfigs:emptyState.description")}
            </p>
          </div>
        )}
      </div>
    </div>
  </PageContainer>
  );
}
