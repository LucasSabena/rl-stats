import type { ShareContext } from "@/lib/types";
import type { Ctx } from "./types";
import { drawBg } from "./background";
import {
  drawConfigCard,
  drawFooter,
  drawHeader,
  drawMatchPlayers,
  drawScoreHero,
  drawSquad,
  drawStatsGrid,
  drawTriptychHero,
} from "./cards";
import { ensureShareFontsReady } from "./text";

/* ─── Public API ─── */
export function computeShareHeight(_ctxData: ShareContext, _W: number): number {
  // _ctxData y _W se reservan para layout dinámico futuro
  void _ctxData;
  void _W;
  return 1920;
}

export async function renderShareCard(
  c: Ctx,
  ctxData: ShareContext,
  W: number,
  H: number,
  iconSrc?: string
): Promise<void> {
  const pad = 80;

  // Without this the card can render in the system fallback face if the
  // webfont hasn't resolved yet.
  await ensureShareFontsReady();

  drawBg(c, W, H, ctxData.win);

  let y = await drawHeader(c, W, pad, ctxData, iconSrc);

  const isMatch = ctxData.type === "match";
  const isConfig = ctxData.type === "config";

  if (isConfig) {
    y = drawConfigCard(c, W, y, pad, ctxData);
  } else if (isMatch && (ctxData.teamScore !== undefined || ctxData.opponentScore !== undefined)) {
    y = drawScoreHero(c, W, y, pad, ctxData);
    y = drawMatchPlayers(c, W, y, pad, ctxData.matchPlayers);
  } else {
    y = drawTriptychHero(c, W, y, pad, ctxData.stats);
  }

  if (!isConfig) {
    y = drawSquad(c, W, y, pad, ctxData.friendsPresent);
    const gridStats = isMatch ? ctxData.stats : ctxData.stats.filter(s => !s.highlight);
    drawStatsGrid(c, W, y, pad, gridStats);
  }

  drawFooter(c, W, H, pad);
}

export function downloadShareCard(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function shareToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error("Failed to create blob")); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, "image/png");
  });
}
