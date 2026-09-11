import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTrainingPacks } from "@/hooks/useTrainingPacks";
import { useTrainingPackMutations } from "@/hooks/useUserTrainingPacks";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CategoryFilter } from "@/components/training-packs/CategoryFilter";
import { TrainingPackDetail } from "@/components/training-packs/TrainingPackDetail";
import { AddPackModal } from "@/components/training-packs/AddPackModal";
import { useTrainingPacksStore } from "@/stores/trainingPacksStore";
import type { TrainingPack } from "@/lib/trainingPacksTypes";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Star,
  RotateCw,
  Target,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";

const DIFF_BADGE: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  beginner: {
    bg: "bg-accent-success-subtle",
    text: "text-accent-success",
    border: "border-accent-success/20",
  },
  intermediate: {
    bg: "bg-accent-info-subtle",
    text: "text-accent-info",
    border: "border-accent-info/20",
  },
  advanced: {
    bg: "bg-accent-warning-subtle",
    text: "text-accent-warning",
    border: "border-accent-warning/20",
  },
  pro: {
    bg: "bg-accent-danger-subtle",
    text: "text-accent-danger",
    border: "border-accent-danger/20",
  },
};

export function TrainingPacksPage() {
  const { t } = useTranslation("trainingPacks");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeDifficulty, setActiveDifficulty] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { packs, userPacks, featuredPacks, filteredPacks, refetch } =
    useTrainingPacks();
  const { favorites, toggleFavorite, isFavorite } = useTrainingPacksStore();
  const { addTrainingPack, removeTrainingPack } = useTrainingPackMutations();
  const [deletePackId, setDeletePackId] = useState<string | null>(null);

  const allPacks = filteredPacks(search, activeCategory, activeDifficulty);
  const visiblePacks = favoritesOnly
    ? allPacks.filter((p) => favorites.has(p.id))
    : allPacks;

  const hasActiveFilters =
    search.trim().length > 0 ||
    activeCategory !== null ||
    activeDifficulty !== null ||
    favoritesOnly;

  const clearFilters = useCallback(() => {
    setSearch("");
    setActiveCategory(null);
    setActiveDifficulty(null);
    setFavoritesOnly(false);
    setShowAll(false);
  }, []);

  const INITIAL_COUNT = 12;
  const displayedPacks = showAll
    ? visiblePacks
    : visiblePacks.slice(0, INITIAL_COUNT);
  const hasMore = visiblePacks.length > INITIAL_COUNT;

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;

  const handleAddSave = useCallback(
    (pack: Omit<TrainingPack, "id" | "featured" | "sourceUrl">) => {
      addTrainingPack.mutate({
        name: pack.name,
        code: pack.code,
        creator: pack.creator,
        category: pack.category,
        difficulty: pack.difficulty,
        description: pack.description,
        tags: pack.tags,
      });
      setAddModalOpen(false);
    },
    [addTrainingPack]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deletePackId) return;
    removeTrainingPack.mutate(deletePackId);
    setDeletePackId(null);
    setSelectedPackId(null);
  }, [deletePackId, removeTrainingPack]);

  const handleCopyCode = useCallback(
    async (pack: TrainingPack, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(pack.code);
        setCopiedId(pack.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        // ignore
      }
    },
    []
  );

  const handleToggleFavorite = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(id);
    },
    [toggleFavorite]
  );

  return (
    <PageContainer>
      <div className="flex flex-col gap-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {t("page.title")}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {visiblePacks.length} {t("page.packList").toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                favoritesOnly
                  ? "border-accent-warning/40 bg-accent-warning/10 text-accent-warning"
                  : "border-border-subtle bg-bg-panel text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
              )}
              title={t("page.favorites")}
            >
              <Star
                size={15}
                className={favoritesOnly ? "fill-accent-warning" : ""}
              />
              <span className="hidden sm:inline">{t("page.favorites")}</span>
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-border-subtle bg-bg-panel p-2 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
              title={t("page.refresh")}
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-2 text-sm font-semibold text-accent-primary-fg transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">{t("page.addPack")}</span>
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              className="w-full rounded-lg border border-border-subtle bg-bg-panel py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50 transition-all"
            />
          </div>

          <CategoryFilter
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          <div className="flex flex-wrap gap-2">
            {(
              ["beginner", "intermediate", "advanced", "pro"] as const
            ).map((d) => {
              const style = DIFF_BADGE[d];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setActiveDifficulty((prev) => (prev === d ? null : d))
                  }
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                    activeDifficulty === d
                      ? `${style.bg} ${style.text} border ${style.border}`
                      : "bg-bg-panel text-text-muted border border-border-subtle hover:bg-bg-hover hover:text-text-primary"
                  )}
                >
                  {t(`difficulties.${d}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        {visiblePacks.length === 0 ? (
          <EmptyState
            icon={Target}
            title={t("page.noResults")}
            description={
              hasActiveFilters ? t("page.noResultsFiltered") : undefined
            }
            actionLabel={
              hasActiveFilters ? t("page.clearFilters") : undefined
            }
            onAction={hasActiveFilters ? clearFilters : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayedPacks.map((pack) => {
                const diff = DIFF_BADGE[pack.difficulty];
                const fav = isFavorite(pack.id);
                const copied = copiedId === pack.id;

                return (
                  <div
                    key={pack.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPackId(pack.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedPackId(pack.id);
                      }
                    }}
                    className={cn(
                      "group relative flex cursor-pointer flex-col rounded-xl border p-4 text-left transition-all duration-200",
                      selectedPackId === pack.id
                        ? "border-accent-primary bg-accent-primary-muted shadow-md"
                        : "border-border-subtle bg-bg-panel hover:border-border-highlight hover:bg-bg-hover hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="rounded-full bg-bg-elevated border border-border-subtle px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                        {t(`categories.${pack.category}`)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(pack.id, e)}
                        aria-label={
                          fav
                            ? t("page.removeFavorite", { name: pack.name })
                            : t("page.addFavorite", { name: pack.name })
                        }
                        className={cn(
                          "rounded-lg p-1 transition-all",
                          fav
                            ? "text-accent-warning"
                            : "text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-accent-warning"
                        )}
                      >
                        <Star
                          size={14}
                          className={fav ? "fill-accent-warning" : ""}
                        />
                      </button>
                    </div>

                    <h3 className="text-sm font-bold text-text-primary truncate">
                      {pack.name}
                    </h3>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-text-muted truncate">
                        {pack.creator}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          diff.bg,
                          diff.text
                        )}
                      >
                        {t(`difficulties.${pack.difficulty}`).slice(0, 3)}
                      </span>
                    </div>

                    <div className="mt-auto pt-3 flex items-center gap-2">
                      <span className="flex-1 truncate font-mono text-xs text-text-secondary bg-bg-base rounded-md px-2 py-1.5 border border-border-subtle">
                        {pack.code}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyCode(pack, e)}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
                          copied
                            ? "border-accent-success bg-accent-success-subtle text-accent-success"
                            : "border-border-subtle bg-bg-base text-text-tertiary hover:text-accent-primary hover:border-accent-primary/30"
                        )}
                      >
                        {copied ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && !showAll && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-panel px-5 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-bg-hover hover:text-text-primary"
                >
                  <ChevronDown size={16} />
                  {t("page.showMore", { remaining: visiblePacks.length - INITIAL_COUNT })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Featured Section */}
        {!activeCategory &&
          !activeDifficulty &&
          !search &&
          !favoritesOnly &&
          featuredPacks.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border-subtle" />
                <span className="text-xs font-semibold text-text-tertiary">
                  {t("page.featuredPacks")}
                </span>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {featuredPacks.slice(0, 4).map((pack) => {
                  const diff = DIFF_BADGE[pack.difficulty];
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setSelectedPackId(pack.id)}
                      className="group flex flex-col rounded-xl border border-accent-primary/20 bg-accent-primary-muted/30 p-4 text-left transition-all hover:border-accent-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Star
                          size={12}
                          className="text-accent-warning fill-accent-warning"
                        />
                        <span className="text-[10px] font-semibold text-accent-primary">
                          {t("page.featured")}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-text-primary truncate">
                        {pack.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {pack.creator}
                      </p>
                      <div className="mt-auto pt-3 flex items-center gap-2">
                        <span className="font-mono text-xs text-text-secondary">
                          {pack.code}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            diff.bg,
                            diff.text
                          )}
                        >
                          {t(`difficulties.${pack.difficulty}`).slice(0, 3)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </div>

      {/* Detail Modal */}
      {selectedPack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedPackId(null)}
        >
          <div
            className="w-full max-w-lg animate-slide-in-up"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <TrainingPackDetail
              pack={selectedPack}
              isFavorite={isFavorite(selectedPack.id)}
              onToggleFavorite={() => toggleFavorite(selectedPack.id)}
              onClose={() => setSelectedPackId(null)}
              isUser={userPacks.some((pack) => pack.id === selectedPack.id)}
              onDelete={() => setDeletePackId(selectedPack.id)}
            />
          </div>
        </div>
      )}

      <AddPackModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddSave}
      />

      <ConfirmModal
        isOpen={deletePackId !== null}
        onClose={() => setDeletePackId(null)}
        onConfirm={handleDeleteConfirm}
        title={t("page.deletePack")}
        description={t("page.deletePackConfirm")}
        confirmLabel={t("page.deletePack")}
        variant="danger"
        isPending={removeTrainingPack.isPending}
      />
    </PageContainer>
  );
}
