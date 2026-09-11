// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useUserTrainingPacks } = await import("./useUserTrainingPacks");

const LEGACY_KEY = "rl-training-packs";

const storedPack = {
  id: "legacy-1",
  name: "Legacy Pack",
  code: "CODE-1",
  creator: "Tester",
  category: "aerial",
  difficulty: "advanced",
  description: "desc",
  tags: ["air"],
  sourceUrl: null,
  createdAt: 1,
  updatedAt: 1,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUserTrainingPacks legacy migration", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("imports legacy localStorage packs through the command and keeps favorites", async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        userPacks: [
          {
            id: "legacy-1",
            name: "Legacy Pack",
            code: "CODE-1",
            creator: "Tester",
            category: "aerial",
            difficulty: "advanced",
            description: "desc",
            tags: ["air"],
          },
          { name: "", code: "" },
        ],
        favorites: ["fav-1"],
      }),
    );

    let listCalls = 0;
    invokeMock.mockImplementation(async (command: string, args: unknown) => {
      if (command === "list_training_packs") {
        listCalls += 1;
        return listCalls === 1 ? [] : [storedPack];
      }
      if (command === "upsert_training_pack") {
        expect(args).toMatchObject({ pack: { name: "Legacy Pack" } });
        return storedPack;
      }
      throw new Error(`unexpected command ${command}`);
    });

    const { result } = renderHook(() => useUserTrainingPacks(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0].name).toBe("Legacy Pack");

    // The invalid legacy entry is skipped, not sent.
    const upserts = invokeMock.mock.calls.filter(
      ([command]) => command === "upsert_training_pack",
    );
    expect(upserts).toHaveLength(1);

    // Packs are removed from the blob; favorites survive for the store.
    const persisted = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}");
    expect(persisted.userPacks).toBeUndefined();
    expect(persisted.favorites).toEqual(["fav-1"]);
  });

  it("does not touch legacy storage when the database already has packs", async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ userPacks: [{ name: "Old", code: "OLD-1" }], favorites: [] }),
    );
    invokeMock.mockResolvedValue([storedPack]);

    const { result } = renderHook(() => useUserTrainingPacks(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(
      invokeMock.mock.calls.filter(([command]) => command === "upsert_training_pack"),
    ).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}").userPacks).toHaveLength(1);
  });
});
