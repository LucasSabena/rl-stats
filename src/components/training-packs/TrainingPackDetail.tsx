import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TrainingPack, PackDifficulty } from "@/lib/trainingPacksTypes";
import { ExternalLink, Copy, Star, X, Check } from "lucide-react";
import { useState } from "react";

interface TrainingPackDetailProps {
  pack: TrainingPack | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose?: () => void;
}

const DIFFICULTY_STYLES: Record<
  PackDifficulty,
  { badge: string; label: string }
> = {
  beginner: {
    badge:
      "bg-accent-success-subtle text-accent-success border border-accent-success/20",
    label: "Principiante",
  },
  intermediate: {
    badge:
      "bg-accent-info-subtle text-accent-info border border-accent-info/20",
    label: "Intermedio",
  },
  advanced: {
    badge:
      "bg-accent-warning-subtle text-accent-warning border border-accent-warning/20",
    label: "Avanzado",
  },
  pro: {
    badge:
      "bg-accent-danger-subtle text-accent-danger border border-accent-danger/20",
    label: "Profesional",
  },
};

export function TrainingPackDetail({
  pack,
  isFavorite,
  onToggleFavorite,
  onClose,
}: TrainingPackDetailProps) {
  const { t } = useTranslation("trainingPacks");
  const [copied, setCopied] = useState(false);
  const [justToggled, setJustToggled] = useState(false);

  if (!pack) return null;

  const diffStyle = DIFFICULTY_STYLES[pack.difficulty];

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pack.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleToggleFavorite = () => {
    onToggleFavorite();
    setJustToggled(true);
    setTimeout(() => setJustToggled(false), 600);
  };

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full bg-bg-elevated border border-border-subtle px-2.5 py-0.5 text-[10px] font-semibold text-text-muted">
              {t(`categories.${pack.category}`)}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide",
                diffStyle.badge
              )}
            >
              {t(`difficulties.${pack.difficulty}`)}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-text-primary leading-tight">
            {pack.name}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{pack.creator}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Code display */}
      <div className="rounded-xl border border-border-subtle bg-bg-base p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-text-muted">
            {t("page.codeLabel")}
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              copied
                ? "bg-accent-success text-white"
                : "bg-accent-primary text-white hover:brightness-110"
            )}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t("page.copied") : t("page.copyCode")}
          </button>
        </div>
        <div
          className="numeral text-xl font-bold text-text-primary break-all select-all cursor-pointer"
          onClick={handleCopyCode}
          title={t("page.copyCode")}
        >
          {pack.code}
        </div>
      </div>

      {/* Description */}
      {pack.description && (
        <div>
          <span className="text-[10px] font-semibold text-text-muted block mb-1.5">
            {t("page.descriptionLabel")}
          </span>
          <p className="text-sm text-text-secondary leading-relaxed">
            {pack.description}
          </p>
        </div>
      )}

      {/* Tags */}
      {pack.tags && pack.tags.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-text-muted block mb-1.5">
            Tags
          </span>
          <div className="flex flex-wrap gap-2">
            {pack.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-bg-elevated border border-border-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Source link */}
      {pack.sourceUrl && (
        <a
          href={pack.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-link hover:text-link-hover transition-colors"
        >
          <ExternalLink size={13} />
          {t("card.viewDetails")}
        </a>
      )}

      {/* Favorite button */}
      <button
        type="button"
        onClick={handleToggleFavorite}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all",
          isFavorite
            ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20"
            : "border-border-subtle bg-bg-panel text-text-secondary hover:bg-bg-hover hover:text-text-primary",
          justToggled && "scale-[1.02]"
        )}
      >
        <Star
          size={16}
          className={cn(
            "transition-all",
            isFavorite ? "fill-yellow-400 text-yellow-400" : "",
            justToggled && "animate-spin"
          )}
        />
        {isFavorite
          ? t("page.removedFromFavorites")
          : t("page.addedToFavorites")}
      </button>
    </div>
  );
}
