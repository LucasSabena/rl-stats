import type { ShareContext, ShareStat, SharePlayer } from "@/lib/types";

/* ─── Design tokens ───
   Mirrors the app's dark palette so a shared card is recognisably the same
   product. These are literals rather than var() lookups because canvas
   cannot resolve CSS custom properties. Keep in sync with globals.css. */
const C = {
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
const FONT = {
  heading: '"Geist Variable", system-ui, sans-serif',
  body: '"Geist Variable", system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, monospace',
} as const;

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

type Ctx = CanvasRenderingContext2D;

/* ─── Helpers ─── */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rad);
  c.lineTo(x + w, y + h - rad);
  c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  c.lineTo(x + rad, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rad);
  c.lineTo(x, y + rad);
  c.quadraticCurveTo(x, y, x + rad, y);
  c.closePath();
}

function txt(c: Ctx, text: string, x: number, y: number, opts: {
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

/* ─── Background ─── */
function drawBg(c: Ctx, W: number, H: number, isWin?: boolean) {
  // Base gradient
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, C.bg1);
  grad.addColorStop(0.5, C.bg2);
  grad.addColorStop(1, C.bg1);
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  // Subtle scanlines
  c.save();
  c.strokeStyle = "rgba(255,255,255,0.01)";
  c.lineWidth = 2;
  for (let sy = 0; sy < H; sy += 8) {
    c.beginPath(); c.moveTo(0, sy); c.lineTo(W, sy); c.stroke();
  }
  c.restore();

  // Decorative grid/lines
  c.save();
  c.strokeStyle = "rgba(255,255,255,0.03)";
  c.lineWidth = 1;
  const step = 120; // Sparse grid
  for (let x = 0; x < W; x += step) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y < H; y += step) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  c.restore();

  // Glow orbs with deeper colors
  const accentColor = isWin === true ? C.win : isWin === false ? C.loss : C.accentAlt;
  
  // Top-left
  const g1 = c.createRadialGradient(W * 0.1, H * 0.1, 0, W * 0.1, H * 0.1, W * 1.2);
  g1.addColorStop(0, hexAlpha(accentColor, 0.2));
  g1.addColorStop(0.4, hexAlpha(accentColor, 0.05));
  g1.addColorStop(1, "transparent");
  c.fillStyle = g1;
  c.fillRect(0, 0, W, H);

  // Bottom-right
  const g2 = c.createRadialGradient(W * 0.9, H * 0.9, 0, W * 0.9, H * 0.9, W * 1.0);
  g2.addColorStop(0, hexAlpha(isWin === false ? C.accentAlt : C.gold, 0.1));
  g2.addColorStop(1, "transparent");
  c.fillStyle = g2;
  c.fillRect(0, 0, W, H);

  // Noise
  c.save();
  c.globalAlpha = 0.03;
  for (let i = 0; i < 1500; i++) {
    const dx = Math.random() * W;
    const dy = Math.random() * H;
    c.fillStyle = "#fff";
    c.fillRect(dx, dy, 2, 2);
  }
  c.restore();

  // Top accent bar with glossy effect
  const topBar = c.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, C.accent);
  topBar.addColorStop(0.5, C.accentAlt);
  topBar.addColorStop(1, C.accent);
  c.fillStyle = topBar;
  c.fillRect(0, 0, W, 8);
  
  const gloss = c.createLinearGradient(0, 0, 0, 8);
  gloss.addColorStop(0, "rgba(255,255,255,0.4)");
  gloss.addColorStop(0.5, "transparent");
  c.fillStyle = gloss;
  c.fillRect(0, 0, W, 8);
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─── Header section ─── */
async function drawHeader(c: Ctx, W: number, pad: number, ctx: ShareContext, iconSrc?: string): Promise<number> {
  let y = 80;

  // Logo + username row
  let logoRight = pad;
  if (iconSrc) {
    try {
      const img = await loadImage(iconSrc);
      const s = 72;
      c.save();
      roundRect(c, pad, y, s, s, 18);
      c.clip();
      c.drawImage(img, pad, y, s, s);
      c.restore();
      logoRight = pad + s + 20;
    } catch { /* skip */ }
  }

  // Username
  if (ctx.username) {
    txt(c, ctx.username, logoRight, y + 24, {
      font: `600 38px ${FONT.body}`, fill: C.text, baseline: "middle",
    });
  }

  // Date label
  txt(c, ctx.dateLabel, W - pad, y + 24, {
    font: `14px ${FONT.mono}`, fill: C.textMuted, align: "right", baseline: "middle",
  });

  y += 100;

  // Title
  const titleColor = ctx.win === true ? C.win : ctx.win === false ? C.loss : C.accent;
  const titleText = ctx.title.toUpperCase();

  c.save();
  const titleSize = 64;
  c.font = `800 ${titleSize}px ${FONT.heading}`;
  const maxTitleW = W - pad * 2;
  const measured = c.measureText(titleText);
  c.restore();

  if (measured.width > maxTitleW) {
    const words = titleText.split(" ");
    let line1 = "";
    let line2 = "";
    let onLine1 = true;
    c.save();
    c.font = `800 ${titleSize}px ${FONT.heading}`;
    for (const word of words) {
      const test = onLine1 ? (line1 ? line1 + " " + word : word) : (line2 ? line2 + " " + word : word);
      if (onLine1 && c.measureText(test).width > maxTitleW) {
        onLine1 = false;
        line2 = word;
      } else if (onLine1) {
        line1 = test;
      } else {
        line2 = test;
      }
    }
    c.restore();
    txt(c, line1, pad, y, { font: `800 ${titleSize}px ${FONT.heading}`, fill: titleColor, baseline: "top" });
    y += titleSize * 1.05;
    if (line2) {
      txt(c, line2, pad, y, { font: `800 ${titleSize}px ${FONT.heading}`, fill: titleColor, baseline: "top", maxWidth: maxTitleW });
      y += titleSize * 1.1;
    }
  } else {
    txt(c, titleText, pad, y, { font: `800 ${titleSize}px ${FONT.heading}`, fill: titleColor, baseline: "top" });
    y += titleSize * 1.1;
  }

  if (ctx.subtitle) {
    y += 4;
    txt(c, ctx.subtitle, pad, y, { font: `20px ${FONT.body}`, fill: C.textSoft, baseline: "top" });
    y += 36;
  }

  return y + 20;
}

/* ─── Score hero (match type) ─── */
function drawScoreHero(c: Ctx, W: number, y: number, pad: number, ctx: ShareContext): number {
  const my = ctx.teamScore ?? 0;
  const opp = ctx.opponentScore ?? 0;
  const centerY = y + 130;

  // Large score
  const scoreText = `${my}  –  ${opp}`;
  c.save();
  c.shadowColor = hexAlpha(ctx.win === true ? C.win : ctx.win === false ? C.loss : C.accentAlt, 0.5);
  c.shadowBlur = 40;
  txt(c, scoreText, W / 2, centerY, {
    font: `800 160px ${FONT.heading}`, fill: C.text, align: "center", baseline: "middle",
  });
  c.restore();

  // Score bar underneath
  const barY = centerY + 110;
  const barW = W - pad * 2;
  const barH = 10;
  const total = Math.max(my + opp, 1);
  const myPct = my / total;
  const myW = Math.max(barW * myPct, 6);

  // Bar background
  c.save();
  roundRect(c, pad, barY, barW, barH, 5);
  c.fillStyle = C.scoreBarOpp;
  c.fill();
  c.restore();

  // My segment
  c.save();
  const barGrad = c.createLinearGradient(pad, 0, pad + myW, 0);
  barGrad.addColorStop(0, C.accent);
  barGrad.addColorStop(1, C.accentAlt);
  roundRect(c, pad, barY, myW, barH, 5);
  c.fillStyle = barGrad;
  c.fill();
  c.restore();

  return barY + barH + 60;
}

/* ─── Triptych hero (session/day/week) ─── */
function drawTriptychHero(c: Ctx, W: number, y: number, pad: number, stats: ShareStat[]): number {
  if (stats.length === 0) return y;

  const highlight = stats.find(s => s.highlight) || stats[0];
  const others = stats.filter(s => s !== highlight);
  const left = others[0];
  const right = others[1];

  const plateH = 260; // Slightly shorter
  const plateW = W - pad * 2;

  // Glass plate bg
  c.save();
  roundRect(c, pad, y, plateW, plateH, 24);
  c.fillStyle = C.surfaceLight;
  c.fill();
  c.strokeStyle = C.border;
  c.lineWidth = 1;
  roundRect(c, pad, y, plateW, plateH, 24);
  c.stroke();
  c.restore();

  const colW = plateW / 3;
  const cx = (i: number) => pad + colW * i + colW / 2;

  // Left stat
  if (left) {
    txt(c, left.label, cx(0), y + plateH * 0.32, {
      font: `600 16px ${FONT.mono}`, fill: C.textMuted, align: "center", baseline: "middle",
    });
    txt(c, left.value, cx(0), y + plateH * 0.65, {
      font: `700 56px ${FONT.heading}`, fill: C.text, align: "center", baseline: "middle",
    });
  }

  // Center hero — bigger
  txt(c, highlight.label, cx(1), y + plateH * 0.25, {
    font: `600 16px ${FONT.mono}`, fill: C.textMuted, align: "center", baseline: "middle",
  });
  txt(c, highlight.value, cx(1), y + plateH * 0.6, {
    font: `800 100px ${FONT.heading}`, fill: C.accent, align: "center", baseline: "middle",
  });

  // Right stat
  if (right) {
    txt(c, right.label, cx(2), y + plateH * 0.32, {
      font: `600 16px ${FONT.mono}`, fill: C.textMuted, align: "center", baseline: "middle",
    });
    txt(c, right.value, cx(2), y + plateH * 0.65, {
      font: `700 56px ${FONT.heading}`, fill: C.text, align: "center", baseline: "middle",
    });
  }

  // Vertical dividers
  c.save();
  c.strokeStyle = C.border;
  c.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = pad + colW * i;
    c.beginPath();
    c.moveTo(x, y + plateH * 0.2);
    c.lineTo(x, y + plateH * 0.8);
    c.stroke();
  }
  c.restore();

  return y + plateH + 40;
}

/* ─── Match Players ─── */
function drawMatchPlayers(c: Ctx, W: number, y: number, pad: number, players?: SharePlayer[]): number {
  if (!players || players.length === 0) return y;

  txt(c, "MATCH PLAYERS", pad, y, {
    font: `600 14px ${FONT.mono}`, fill: C.textMuted, baseline: "top",
  });
  y += 36;

  const rowH = 70; // Shorter rows
  const gap = 10;
  const displayPlayers = players.slice(0, 6);

  for (let i = 0; i < displayPlayers.length; i++) {
    const p = displayPlayers[i];
    const rowY = y + i * (rowH + gap);

    c.save();
    roundRect(c, pad, rowY, W - pad * 2, rowH, 12);
    c.fillStyle = p.isLocal ? "rgba(0,229,160,0.08)" : C.surface;
    c.fill();
    if (p.isLocal) {
      c.strokeStyle = "rgba(0,229,160,0.2)";
      c.stroke();
    }
    c.restore();

    txt(c, p.name, pad + 20, rowY + rowH / 2, {
      font: `600 22px ${FONT.body}`, fill: p.isLocal ? C.accent : C.text, baseline: "middle",
      maxWidth: 380
    });

    const statsX = W - pad - 20;
    const statGap = 90;
    
    // Score
    txt(c, String(p.score), statsX - statGap * 4, rowY + rowH / 2, {
      font: `800 28px ${FONT.heading}`, fill: p.isLocal ? C.accent : C.text, align: "right", baseline: "middle"
    });

    // Goals, Assists, Saves small
    const renderMiniStat = (val: number, label: string, x: number) => {
      txt(c, String(val), x, rowY + rowH / 2, {
        font: `700 26px ${FONT.heading}`, fill: C.text, align: "right", baseline: "middle"
      });
      txt(c, label, x - 28, rowY + rowH / 2 + 2, {
        font: `600 11px ${FONT.mono}`, fill: C.textMuted, align: "right", baseline: "middle"
      });
    };

    renderMiniStat(p.goals, "G", statsX - statGap * 2);
    renderMiniStat(p.assists, "A", statsX - statGap * 1);
    renderMiniStat(p.saves, "S", statsX);
  }

  return y + displayPlayers.length * (rowH + gap) + 40;
}

/* ─── Squad chips ─── */
function drawSquad(c: Ctx, W: number, y: number, pad: number, friends?: string[]): number {
  if (!friends || friends.length === 0) return y;

  txt(c, `SQUAD · ${friends.length}`, pad, y, {
    font: `600 14px ${FONT.mono}`, fill: C.textMuted, baseline: "top",
  });
  y += 36;

  const chipH = 44;
  const gap = 12;
  let chipX = pad;
  const maxW = W - pad;

  for (let i = 0; i < Math.min(friends.length, 5); i++) {
    const name = friends[i];
    c.save();
    c.font = `500 20px ${FONT.body}`;
    const tw = c.measureText(name).width;
    c.restore();
    const chipW = tw + 40;

    if (chipX + chipW > maxW) {
      chipX = pad;
      y += chipH + gap;
    }

    c.save();
    roundRect(c, chipX, y, chipW, chipH, chipH / 2);
    c.fillStyle = C.surface;
    c.fill();
    c.strokeStyle = C.border;
    c.lineWidth = 1;
    roundRect(c, chipX, y, chipW, chipH, chipH / 2);
    c.stroke();
    c.restore();

    c.save();
    c.fillStyle = i % 2 === 0 ? C.accent : C.accentAlt;
    c.beginPath();
    c.arc(chipX + 16, y + chipH / 2, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    txt(c, name, chipX + 30, y + chipH / 2, {
      font: `500 20px ${FONT.body}`, fill: C.text, baseline: "middle",
    });

    chipX += chipW + gap;
  }

  return y + chipH + 40;
}

/* ─── Stats grid (2 columns) ─── */
function drawStatsGrid(c: Ctx, W: number, y: number, pad: number, stats: ShareStat[]): number {
  if (stats.length === 0) return y;

  const cols = 2;
  const gap = 20;
  const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = 130; // Reduced height
  const rows = Math.ceil(stats.length / cols);

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    const row = Math.floor(i / cols);
    const col = i % cols;

    const cellX = pad + col * (cellW + gap);
    const rowY = y + row * (cellH + gap);

    // Skip if we are going too deep (footer starts at H-100)
    // H is 1920, footer line at 1880.
    if (rowY + cellH > 1850) break;

    c.save();
    roundRect(c, cellX, rowY, cellW, cellH, 16);
    c.fillStyle = C.surface;
    c.fill();
    if (stat.highlight) {
      c.strokeStyle = hexAlpha(C.accent, 0.3);
      c.stroke();
    }
    c.restore();

    txt(c, stat.label, cellX + cellW / 2, rowY + 45, {
      font: `600 16px ${FONT.mono}`, fill: C.textMuted, align: "center", baseline: "middle",
    });

    txt(c, stat.value, cellX + cellW / 2, rowY + 85, {
      font: `700 50px ${FONT.heading}`,
      fill: stat.highlight ? C.accent : C.text,
      align: "center", baseline: "middle",
    });
  }

  return y + rows * (cellH + gap) + 40;
}

/* ─── Footer ─── */
function drawFooter(c: Ctx, W: number, H: number, pad: number) {
  const footerY = H - 100;

  const lineGrad = c.createLinearGradient(pad, 0, W - pad, 0);
  lineGrad.addColorStop(0, "transparent");
  lineGrad.addColorStop(0.5, C.border);
  lineGrad.addColorStop(1, "transparent");
  c.fillStyle = lineGrad;
  c.fillRect(pad, footerY - 40, W - pad * 2, 1);

  txt(c, "RL Stats", pad, footerY, {
    font: `600 22px ${FONT.body}`, fill: C.textMuted, baseline: "top",
  });
  txt(c, "github.com/LucasSabena/rl-stats", W - pad, footerY, {
    font: `16px ${FONT.mono}`, fill: C.textMuted, align: "right", baseline: "top",
  });
}

/* ─── Config card ─── */
function drawConfigCard(c: Ctx, W: number, y: number, pad: number, ctx: ShareContext): number {
  const statsMap = new Map<string, string>();
  for (const s of ctx.stats) {
    statsMap.set(s.label, s.value);
  }
  const getStat = (label: string) => statsMap.get(label) ?? null;

  const drawSection = (title: string, rows: { label: string; value: string | null }[]) => {
    const validRows = rows.filter((r): r is { label: string; value: string } => r.value != null);
    if (validRows.length === 0) return y;

    txt(c, title, pad, y, {
      font: `600 14px ${FONT.mono}`, fill: C.textMuted, baseline: "top",
    });
    y += 36;

    const cols = 2;
    const gap = 16;
    const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
    const cellH = 90;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);

      const cellX = pad + col * (cellW + gap);
      const rowY = y + rowIdx * (cellH + gap);

      if (rowY + cellH > 1850) break;

      c.save();
      roundRect(c, cellX, rowY, cellW, cellH, 12);
      c.fillStyle = C.surface;
      c.fill();
      c.strokeStyle = C.border;
      c.lineWidth = 1;
      roundRect(c, cellX, rowY, cellW, cellH, 12);
      c.stroke();
      c.restore();

      txt(c, row.label, cellX + cellW / 2, rowY + 26, {
        font: `600 13px ${FONT.mono}`, fill: C.textMuted, align: "center", baseline: "middle",
      });
      txt(c, row.value, cellX + cellW / 2, rowY + 58, {
        font: `700 28px ${FONT.heading}`, fill: C.text, align: "center", baseline: "middle",
      });
    }

    const totalRows = Math.ceil(validRows.length / cols);
    y += totalRows * (cellH + gap) + 40;
    return y;
  };

  y = drawSection("CÁMERA", [
    { label: "FOV", value: getStat("FOV") },
    { label: "HEIGHT", value: getStat("Height") },
    { label: "ANGLE", value: getStat("Angle") },
    { label: "DISTANCE", value: getStat("Distance") },
    { label: "STIFFNESS", value: getStat("Stiffness") },
    { label: "SWIVEL", value: getStat("Swivel Speed") },
    { label: "TRANSITION", value: getStat("Transition Speed") },
    { label: "BALL CAM", value: getStat("Ball Cam") },
    { label: "CAM SHAKE", value: getStat("Camera Shake") },
  ]);

  // Deadzone
  y = drawSection("DEADZONE", [
    { label: "SHAPE", value: getStat("Deadzone Shape") },
    { label: "DEADZONE", value: getStat("Deadzone") },
    { label: "DODGE", value: getStat("Dodge Deadzone") },
    { label: "AERIAL", value: getStat("Aerial Sens") },
    { label: "STEERING", value: getStat("Steering Sens") },
  ]);

  // Controls
  y = drawSection("CONTROLES", [
    { label: "POWERSLIDE", value: getStat("Powerslide") },
    { label: "BOOST", value: getStat("Boost") },
    { label: "AIR ROLL L", value: getStat("Air Roll Left") },
    { label: "AIR ROLL R", value: getStat("Air Roll Right") },
  ]);

  // Hardware
  y = drawSection("HARDWARE", [
    { label: "CONTROLLER", value: getStat("Controller") },
    { label: "MONITOR", value: getStat("Monitor") },
    { label: "HEADSET", value: getStat("Headset") },
  ]);

  return y;
}

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
