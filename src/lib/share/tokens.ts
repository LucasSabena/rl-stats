/* ─── Design tokens ───
   Mirrors the app's dark palette so a shared card is recognisably the same
   product. These are literals rather than var() lookups because canvas
   cannot resolve CSS custom properties. Keep in sync with globals.css. */
export const C = {
  bg1: "#0d0f14",
  bg2: "#14171e",
  accent: "#8b7bf7",       // brand violet
  accentAlt: "#5b93f0",    // team blue
  win: "#42c98a",
  loss: "#f2685f",
  gold: "#e8b04b",
  text: "#f7f8fa",
  textSoft: "#adb3c0",
  textMuted: "#838b9b",
  surface: "rgba(255,255,255,0.04)",
  surfaceLight: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  scoreBarMy: "#5b93f0",
  scoreBarOpp: "rgba(255,255,255,0.06)",
} as const;

/* Geist is the only family the app actually ships. The previous stack asked
   for Outfit/Inter/JetBrains Mono, none of which are loaded any more, so
   every share card silently rendered in the system fallback. */
export const FONT = {
  heading: '"Geist Variable", system-ui, sans-serif',
  body: '"Geist Variable", system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, monospace',
} as const;

export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
