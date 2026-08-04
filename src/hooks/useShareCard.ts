import { useCallback, useRef, useState } from "react";
import type { ShareContext } from "@/lib/types";
import { renderShareCard, downloadShareCard, shareToClipboard } from "@/lib/shareEngine";

/** Fixed story dimensions (vertical format like IG stories) */
const STORY_W = 1080;
const STORY_H = 1920;

export function useShareCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (ctx: ShareContext, iconPath?: string): Promise<HTMLCanvasElement | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = STORY_W;
    canvas.height = STORY_H;
    const c = canvas.getContext("2d");
    if (!c) return null;

    setIsGenerating(true);
    try {
      await renderShareCard(c, ctx, STORY_W, STORY_H, iconPath || "/brand/logo-256.png");
      canvasRef.current = canvas;
      return canvas;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const download = useCallback((filename: string) => {
    if (!canvasRef.current) return;
    downloadShareCard(canvasRef.current, filename);
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!canvasRef.current) return;
    await shareToClipboard(canvasRef.current);
  }, []);

  return { generate, download, copyToClipboard, isGenerating, canvasRef };
}
