import type { Ctx } from "./types";
import { C, hexAlpha } from "./tokens";

/* ─── Background ─── */
export function drawBg(c: Ctx, W: number, H: number, isWin?: boolean) {
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
