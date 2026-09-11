// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ShareContext } from "@/lib/types";
import { hexAlpha, C, FONT } from "@/lib/share/tokens";
import { roundRect } from "@/lib/share/layout";
import {
  computeShareHeight,
  downloadShareCard,
  renderShareCard,
} from "@/lib/share/render";
import type { Ctx } from "@/lib/share/types";

/** Any-method canvas stand-in: records calls, fakes gradients. */
function mockCtx() {
  const calls: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop === "canvas") return { width: 1080, height: 1920 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return (...args: unknown[]) => {
          calls.push(prop);
          void args;
          return gradient;
        };
      }
      if (prop === "measureText") {
        return (text: string) => ({ width: text.length * 10 });
      }
      if (!(prop in obj)) {
        obj[prop] = (...args: unknown[]) => {
          calls.push(prop);
          void args;
          return undefined;
        };
      }
      return obj[prop];
    },
    set(obj, prop: string, value) {
      obj[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as Ctx, calls };
}

const summaryContext: ShareContext = {
  type: "week",
  title: "Resumen",
  subtitle: "Semanal",
  username: "Tester",
  stats: [
    { label: "Partidas", value: "12" },
    { label: "Win rate", value: "58%", highlight: true },
  ],
  friendsPresent: ["Amigo1", "Amigo2"],
  dateLabel: "Sep 2026",
};

describe("share render pipeline", () => {
  it("hexAlpha keeps hex colours and applies alpha", () => {
    expect(hexAlpha("#ff00aa", 0.5)).toBe("rgba(255,0,170,0.5)");
  });

  it("roundRect paints a rounded path without throwing", () => {
    const { ctx, calls } = mockCtx();
    roundRect(ctx, 0, 0, 100, 50, 8);
    expect(calls).toContain("beginPath");
    expect(calls).toContain("closePath");
  });

  it("computeShareHeight returns the fixed card height", () => {
    expect(computeShareHeight(summaryContext, 1080)).toBe(1920);
    expect(FONT.body).toBeTruthy();
    expect(C.accent).toBe("#8b7bf7");
  });

  it("renderShareCard draws background, header and footer for a week card", async () => {
    const { ctx, calls } = mockCtx();
    await renderShareCard(ctx, summaryContext, 1080, 1920);
    expect(calls).toContain("fillRect");
    // Header + stats grid write text through the shared helper.
    expect(calls).toContain("fillText");
    expect(calls.filter((name) => name === "save").length).toBeGreaterThan(1);
  });

  it("renderShareCard uses the score hero for match contexts", async () => {
    const { ctx, calls } = mockCtx();
    const matchContext: ShareContext = {
      ...summaryContext,
      type: "match",
      title: "Victoria",
      win: true,
      teamScore: 3,
      opponentScore: 1,
      matchPlayers: [
        { name: "Tester", score: 500, goals: 2, assists: 1, saves: 0, isLocal: true },
      ],
    };
    await renderShareCard(ctx, matchContext, 1080, 1920);
    // The score hero paints the big score numbers.
    expect(calls).toContain("fillText");
    expect(calls).toContain("fillRect");
  });

  it("downloadShareCard clicks a download link with the canvas data url", () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const canvas = {
      toDataURL: vi.fn(() => "data:image/png;base64,AAA"),
    } as unknown as HTMLCanvasElement;

    downloadShareCard(canvas, "card.png");

    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
