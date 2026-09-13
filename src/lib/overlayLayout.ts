export type StudioModuleId =
  | "score"
  | "timer"
  | "rosters"
  | "events"
  | "ball"
  | "info";

export const STUDIO_MODULES: StudioModuleId[] = [
  "score",
  "timer",
  "rosters",
  "events",
  "ball",
  "info",
];

/** Module geometry lives in percentages of a 1920×1080 canvas. */
export interface StudioModule {
  id: StudioModuleId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StudioTheme {
  accent: string;
  radius: number;
  scale: number;
}

export interface StudioLayout {
  v: 1;
  theme: StudioTheme;
  modules: StudioModule[];
}

export const DEFAULT_STUDIO_LAYOUT: StudioLayout = {
  v: 1,
  theme: { accent: "#7c5cff", radius: 8, scale: 1 },
  modules: [
    { id: "score", x: 41, y: 3, w: 18, h: 9 },
    { id: "timer", x: 44, y: 13, w: 12, h: 6 },
    { id: "rosters", x: 2, y: 24, w: 22, h: 34 },
    { id: "events", x: 76, y: 24, w: 22, h: 34 },
    { id: "ball", x: 2, y: 3, w: 11, h: 7 },
    { id: "info", x: 87, y: 3, w: 11, h: 7 },
  ],
};

export const MIN_MODULE_W = 6;
export const MIN_MODULE_H = 5;

/** Geometry used when a module is added from the palette. */
export const DEFAULT_MODULE_GEOMETRY: Record<
  StudioModuleId,
  Omit<StudioModule, "id">
> = {
  score: { x: 41, y: 3, w: 18, h: 9 },
  timer: { x: 44, y: 13, w: 12, h: 6 },
  rosters: { x: 2, y: 24, w: 22, h: 34 },
  events: { x: 76, y: 24, w: 22, h: 34 },
  ball: { x: 2, y: 3, w: 11, h: 7 },
  info: { x: 87, y: 3, w: 11, h: 7 },
};

export function clampModule(module: StudioModule): StudioModule {
  const w = Math.min(100, Math.max(MIN_MODULE_W, module.w));
  const h = Math.min(100, Math.max(MIN_MODULE_H, module.h));
  return {
    ...module,
    w,
    h,
    x: Math.min(100 - w, Math.max(0, module.x)),
    y: Math.min(100 - h, Math.max(0, module.y)),
  };
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeLayout(layout: StudioLayout): string {
  return base64UrlEncode(JSON.stringify(layout));
}

export function decodeLayout(raw: string | null): StudioLayout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(raw)) as StudioLayout;
    if (!parsed || !Array.isArray(parsed.modules)) return null;
    return {
      v: 1,
      theme: {
        accent: parsed.theme?.accent ?? DEFAULT_STUDIO_LAYOUT.theme.accent,
        radius: parsed.theme?.radius ?? DEFAULT_STUDIO_LAYOUT.theme.radius,
        scale: parsed.theme?.scale ?? DEFAULT_STUDIO_LAYOUT.theme.scale,
      },
      modules: parsed.modules
        .filter((module): module is StudioModule =>
          STUDIO_MODULES.includes(module?.id as StudioModuleId)
        )
        .map(clampModule),
    };
  } catch {
    return null;
  }
}

export function buildStudioUrl(
  port: number,
  token: string,
  layout: StudioLayout
): string {
  const query = new URLSearchParams();
  if (token) query.set("token", token);
  query.set("layout", encodeLayout(layout));
  return `http://127.0.0.1:${port}/overlays/studio?${query.toString()}`;
}

// ─── Saved scenes (local to this machine) ────────────────────────────────────

const SCENES_KEY = "rl-overlay-scenes";

export interface StudioScene {
  name: string;
  layout: StudioLayout;
  updatedAt: number;
}

export function listScenes(): StudioScene[] {
  try {
    const raw = localStorage.getItem(SCENES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (scene): scene is StudioScene =>
          !!scene &&
          typeof (scene as StudioScene).name === "string" &&
          Array.isArray((scene as StudioScene).layout?.modules)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveScene(name: string, layout: StudioLayout): StudioScene[] {
  const scenes = listScenes().filter((scene) => scene.name !== name);
  const next: StudioScene[] = [
    { name, layout, updatedAt: Date.now() },
    ...scenes,
  ].slice(0, 12);
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(next));
  } catch {
    // Scene presets are a convenience; ignore quota errors.
  }
  return next;
}

export function deleteScene(name: string): StudioScene[] {
  const next = listScenes().filter((scene) => scene.name !== name);
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
  return next;
}
