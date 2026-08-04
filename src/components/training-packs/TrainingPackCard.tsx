import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { TrainingPack } from "@/lib/trainingPacksTypes";
import {
  Star,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";

interface TrainingPackCardProps {
  pack: TrainingPack;
  isFavorite: boolean;
  isUserPack?: boolean;
  onToggleFavorite: () => void;
  onCopyCode: () => void;
  onViewDetail: () => void;
  onDelete?: () => void;
}

export function TrainingPackCard({
  pack,
  isFavorite,
  isUserPack,
  onToggleFavorite,
  onCopyCode,
  onViewDetail,
  onDelete,
}: TrainingPackCardProps) {
  const { t } = useTranslation("trainingPacks");

  return (
    <Card
      variant="panel"
      hoverable
      className="relative hover:shadow-level-3 hover:border-border-highlight"
      onClick={onViewDetail}
    >
      {/* Top-left: category badge */}
      <div className="absolute top-3 left-3">
        <Badge variant="default" className="text-[10px]">
          {t(`categories.${pack.category}`)}
        </Badge>
      </div>

      {/* Top-right: favorite button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-3 right-3 rounded-lg p-1.5 transition-colors hover:bg-surface-hover"
        aria-label={isFavorite ? t("page.removedFromFavorites") : t("page.addedToFavorites")}
      >
        <Star
          size={16}
          className={cn(
            "transition-colors",
            isFavorite ? "text-yellow-400 fill-yellow-400" : "text-text-tertiary"
          )}
        />
      </button>

      {/* Content */}
      <div className="mt-6 flex flex-col gap-2">
        {/* Name */}
        <h3 className="font-display text-sm font-bold text-text-primary truncate pr-6">
          {pack.name}
        </h3>

        {/* Creator */}
        <p className="text-xs text-text-muted truncate">
          {pack.creator}
        </p>

        {/* Code row */}
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyCode();
            }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-bg-base px-2 py-1 text-xs font-mono text-text-secondary border border-border-subtle hover:border-border-highlight hover:text-text-primary transition-colors"
          >
            {pack.code}
          </button>
          <Button
            variant="icon"
            size="sm"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onCopyCode();
            }}
            aria-label={t("page.copyCode")}
          >
            <Copy size={13} />
          </Button>
        </div>

        {/* Description */}
        {pack.description && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
            {pack.description}
          </p>
        )}

        {/* Tags */}
        {pack.tags && pack.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {pack.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-bg-base border border-border-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* User pack actions */}
        {isUserPack && (
          <div className="flex items-center justify-end gap-1 mt-1 pt-2 border-t border-border-subtle">
            <span className="flex items-center gap-1 text-[10px] font-medium text-text-muted mr-auto">
              <Pencil size={11} />
              {t("page.myPacks")}
            </span>
            {onDelete && (
              <Button
                variant="icon"
                size="sm"
                className="h-7 w-7 text-accent-danger hover:bg-accent-danger-subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label={t("page.deletePack")}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
