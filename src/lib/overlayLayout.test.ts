// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STUDIO_LAYOUT,
  buildStudioUrl,
  clampModule,
  decodeLayout,
  deleteScene,
  encodeLayout,
  listScenes,
  saveScene,
} from "./overlayLayout";

afterEach(() => {
  localStorage.clear();
});

describe("clampModule", () => {
  it("keeps modules inside the canvas and above the minimum size", () => {
    expect(clampModule({ id: "score", x: -10, y: -5, w: 2, h: 1 })).toEqual({
      id: "score",
      x: 0,
      y: 0,
      w: 6,
      h: 5,
    });
    expect(clampModule({ id: "score", x: 99, y: 99, w: 30, h: 30 }).x).toBe(70);
  });
});

describe("encode/decode layout", () => {
  it("round-trips a layout", () => {
    const encoded = encodeLayout(DEFAULT_STUDIO_LAYOUT);
    const decoded = decodeLayout(encoded);
    expect(decoded?.modules).toHaveLength(DEFAULT_STUDIO_LAYOUT.modules.length);
    expect(decoded?.theme.accent).toBe(DEFAULT_STUDIO_LAYOUT.theme.accent);
  });

  it("returns null for garbage", () => {
    expect(decodeLayout("not-base64!!")).toBeNull();
    expect(decodeLayout(null)).toBeNull();
  });

  it("drops unknown modules and fixes invalid ones", () => {
    const encoded = encodeLayout({
      v: 1,
      theme: { accent: "#fff", radius: 4, scale: 1 },
      // @ts-expect-error deliberately invalid module id for sanitization
      modules: [{ id: "nope", x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(decodeLayout(encoded)?.modules).toEqual([]);
  });
});

describe("buildStudioUrl", () => {
  it("includes the token and layout", () => {
    const url = buildStudioUrl(9528, "abc", DEFAULT_STUDIO_LAYOUT);
    expect(url).toContain("http://127.0.0.1:9528/overlays/studio?");
    expect(url).toContain("token=abc");
    expect(url).toContain("layout=");
  });
});

describe("scenes", () => {
  it("saves, lists and deletes scenes", () => {
    saveScene("Broadcast", DEFAULT_STUDIO_LAYOUT);
    expect(listScenes().map((scene) => scene.name)).toEqual(["Broadcast"]);

    saveScene("Minimal", DEFAULT_STUDIO_LAYOUT);
    expect(listScenes()).toHaveLength(2);

    deleteScene("Broadcast");
    expect(listScenes().map((scene) => scene.name)).toEqual(["Minimal"]);
  });
});
