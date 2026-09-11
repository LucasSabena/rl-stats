export const FONT_SCALE = {
  small: {
    root: "text-[10px]",
    score: "text-[24px]",
    timer: "text-[12px]",
    name: "max-w-[60px]",
    playerScore: "text-[11px]",
    stats: "text-[9px]",
    mmr: "text-[9px]",
    arena: "text-[9px]",
  },
  medium: {
    root: "text-[12px]",
    score: "text-[32px]",
    timer: "text-[14px]",
    name: "max-w-[80px]",
    playerScore: "text-[13px]",
    stats: "text-[11px]",
    mmr: "text-[11px]",
    arena: "text-[11px]",
  },
  large: {
    root: "text-[14px]",
    score: "text-[42px]",
    timer: "text-[18px]",
    name: "max-w-[110px]",
    playerScore: "text-[15px]",
    stats: "text-[13px]",
    mmr: "text-[13px]",
    arena: "text-[13px]",
  },
} as const;

export type FontScale = typeof FONT_SCALE[keyof typeof FONT_SCALE];
