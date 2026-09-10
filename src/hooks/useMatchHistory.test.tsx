// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MATCH_HISTORY_PAGE_SIZE, useMatchHistory } from "./useMatchHistory";
import type { MatchSummary } from "@/lib/types";

const getMatches = vi.fn();

vi.mock("@/lib/api", () => ({
  getMatches: (filters: unknown) => getMatches(filters),
}));

function makeMatches(count: number, offset: number): MatchSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    matchGuid: `guid-${offset + i}`,
    startTime: 1_760_000_000 + offset + i,
    endTime: null,
    durationSeconds: 300,
    arena: "DFH Stadium",
    teamBlueScore: 1,
    teamOrangeScore: 2,
    winnerTeamNum: 1,
    localTeamNum: 1,
    isOnline: true,
    isOvertime: false,
    matchType: "ranked",
    playlist: "Doubles",
    mood: null,
  }));
}

function Consumer() {
  const { data, hasNextPage, fetchNextPage, isSuccess } = useMatchHistory();
  const count = data?.pages.flat().length ?? 0;
  return (
    <div>
      {isSuccess && <span data-testid="count">{count}</span>}
      <span data-testid="has-next">{String(Boolean(hasNextPage))}</span>
      <button type="button" onClick={() => void fetchNextPage()}>
        load-more
      </button>
    </div>
  );
}

function renderConsumer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Consumer />
    </QueryClientProvider>,
  );
}

describe("useMatchHistory", () => {
  beforeEach(() => {
    getMatches.mockReset();
  });

  it("requests the first page with the page size and offers the next page", async () => {
    getMatches.mockImplementation(({ offset }: { offset: number }) =>
      Promise.resolve(
        makeMatches(
          offset === 0 ? MATCH_HISTORY_PAGE_SIZE : 7,
          offset,
        ),
      ),
    );

    renderConsumer();

    await screen.findByText(String(MATCH_HISTORY_PAGE_SIZE));
    expect(getMatches).toHaveBeenCalledWith(
      expect.objectContaining({ limit: MATCH_HISTORY_PAGE_SIZE, offset: 0 }),
    );
    expect(screen.getByTestId("has-next").textContent).toBe("true");

    cleanup();
  });

  it("appends the next page and stops when a short page arrives", async () => {
    getMatches.mockImplementation(({ offset }: { offset: number }) =>
      Promise.resolve(
        makeMatches(
          offset === 0 ? MATCH_HISTORY_PAGE_SIZE : 7,
          offset,
        ),
      ),
    );

    renderConsumer();
    await screen.findByText(String(MATCH_HISTORY_PAGE_SIZE));

    fireEvent.click(screen.getByText("load-more"));

    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe(
        String(MATCH_HISTORY_PAGE_SIZE + 7),
      ),
    );
    expect(getMatches).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: MATCH_HISTORY_PAGE_SIZE,
        offset: MATCH_HISTORY_PAGE_SIZE,
      }),
    );
    expect(screen.getByTestId("has-next").textContent).toBe("false");

    cleanup();
  });
});
