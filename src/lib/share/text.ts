import type { Ctx } from "./types";

/**
 * Canvas draws with whatever fonts are already loaded, so a card rendered
 * before the webfont resolves falls back to system-ui. Awaiting this first
 * keeps the output consistent.
 */
export async function ensureShareFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 48px "Geist Variable"'),
      document.fonts.load('400 24px "Geist Variable"'),
      document.fonts.load('500 24px "Geist Mono Variable"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fallback rendering is acceptable; never block sharing on font loading.
  }
}

export function txt(c: Ctx, text: string, x: number, y: number, opts: {
  font: string; fill: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline;
  maxWidth?: number;
}) {
  c.save();
  c.font = opts.font;
  c.fillStyle = opts.fill;
  c.textAlign = opts.align ?? "left";
  c.textBaseline = opts.baseline ?? "alphabetic";
  if (opts.maxWidth) {
    c.fillText(text, x, y, opts.maxWidth);
  } else {
    c.fillText(text, x, y);
  }
  c.restore();
}
