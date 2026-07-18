import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useShareCard } from "@/hooks/useShareCard";
import type { ShareContext } from "@/lib/types";
import { Check, Copy, Download, Image, RefreshCw, Sparkles } from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: ShareContext | null;
}

export function ShareModal({ isOpen, onClose, context }: ShareModalProps) {
  const { t } = useTranslation("share");
  const { generate, download, copyToClipboard, isGenerating } = useShareCard();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPreview = useCallback(async () => {
    if (!context) return;
    setError(null);
    try {
      const canvas = await generate(context, "/icon.png");
      if (!canvas) {
        throw new Error(t("modal.generationError"));
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error(t("modal.generationError"))), "image/png");
      });
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("modal.generationError"));
    }
  }, [context, generate, t]);

  useEffect(() => {
    if (isOpen && context) {
      setPreviewUrl(null);
      setCopied(false);
      setError(null);
      const tm = setTimeout(buildPreview, 100);
      return () => clearTimeout(tm);
    }
    if (!isOpen) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
    return undefined;
  }, [isOpen, context, buildPreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownload = () => {
    if (!context) return;
    const date = new Date().toISOString().slice(0, 10);
    download(`rl-stats-${context.type}-${date}.png`);
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard();
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("modal.clipboardError"));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("modal.title", { defaultValue: "Compartir Resumen" })}
      description={t("modal.description", { defaultValue: "Generá una imagen lista para compartir en redes." })}
      size="xl"
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("modal.close", { defaultValue: "Cerrar" })}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={!previewUrl || isGenerating}
            leftIcon={copied ? Check : Copy}
          >
            {copied ? t("modal.copied", { defaultValue: "Copiado!" }) : t("modal.copyClipboard", { defaultValue: "Copiar" })}
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={!previewUrl || isGenerating}
            leftIcon={Download}
          >
            {t("modal.download", { defaultValue: "Descargar PNG" })}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-border-default bg-bg-base p-3 shadow-inner">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_45%)]" />
          {isGenerating && !previewUrl ? (
            <div className="relative flex flex-col items-center gap-3 text-center text-text-secondary" role="status">
              <RefreshCw size={24} className="animate-spin text-accent-primary" />
              <span className="text-sm">{t("modal.generating", { defaultValue: "Generando imagen..." })}</span>
            </div>
          ) : null}
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t("modal.previewAlt")}
              className="relative max-h-[62vh] w-auto rounded-lg object-contain shadow-level-4"
            />
          ) : null}
          {!isGenerating && !previewUrl && !error ? (
            <Image size={36} className="relative text-text-muted" aria-hidden="true" />
          ) : null}
        </div>

        <aside className="space-y-3" aria-label={t("modal.exportOptions")}>
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Sparkles size={15} className="text-accent-primary" />
              {t("modal.storyReady")}
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-text-tertiary">{t("modal.format")}</dt><dd className="font-medium text-text-secondary">PNG</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-text-tertiary">{t("modal.dimensions")}</dt><dd className="font-mono text-text-secondary">1080 × 1920</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-text-tertiary">{t("modal.ratio")}</dt><dd className="font-mono text-text-secondary">9:16</dd></div>
            </dl>
          </div>
          <p className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-xs leading-relaxed text-text-tertiary">
            {t("modal.tip")}
          </p>
          <Button variant="secondary" size="sm" onClick={buildPreview} disabled={isGenerating} leftIcon={RefreshCw} className="w-full">
            {t("modal.regenerate")}
          </Button>
          {copied ? <p className="text-center text-xs font-medium text-accent-success" role="status">{t("modal.copied")}</p> : null}
          {error ? <p className="rounded-lg border border-accent-danger/20 bg-accent-danger/10 p-3 text-xs leading-relaxed text-accent-danger" role="alert">{error}</p> : null}
        </aside>
      </div>
    </Modal>
  );
}
