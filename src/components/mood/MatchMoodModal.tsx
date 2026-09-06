import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MoodPicker } from "@/components/mood/MoodPicker";
import { useSetMatchMood } from "@/hooks/useSetMatchMood";
import type { MoodKey } from "@/lib/moods";

interface MatchFinishedPayload {
  matchId: number;
  guid: string;
  isTraining?: boolean;
  winner?: number | null;
  scoreBlue?: number;
  scoreOrange?: number;
}

interface PendingMatch {
  matchId: number;
  isTraining: boolean;
}

/**
 * Post-match mood prompt, mounted once at the app root.
 *
 * Opens when the backend emits `match-finished` (training matches excluded)
 * and auto-dismisses — without saving — when the next match starts
 * (`match-started`), so an unanswered prompt never blocks the UI.
 */
export function MatchMoodModal() {
  const { t } = useTranslation(["mood", "common"]);
  const [pending, setPending] = useState<PendingMatch | null>(null);
  const [selected, setSelected] = useState<MoodKey | null>(null);
  const pendingRef = useRef<PendingMatch | null>(null);
  pendingRef.current = pending;

  const moodMutation = useSetMatchMood();

  useEffect(() => {
    let unlistenFinished: UnlistenFn | null = null;
    let unlistenStarted: UnlistenFn | null = null;
    let cancelled = false;

    async function setup() {
      try {
        unlistenFinished = await listen<MatchFinishedPayload>("match-finished", (event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.isTraining) return;
          if (typeof payload.matchId !== "number") return;
          setPending({ matchId: payload.matchId, isTraining: false });
          setSelected(null);
        });
        // A new match starting supersedes the pending prompt.
        unlistenStarted = await listen("match-started", () => {
          if (cancelled) return;
          setPending(null);
          setSelected(null);
        });
      } catch {
        // Running outside Tauri (browser dev) — the modal simply never opens.
      }
    }
    void setup();

    return () => {
      cancelled = true;
      if (unlistenFinished) unlistenFinished();
      if (unlistenStarted) unlistenStarted();
    };
  }, []);

  const close = useCallback(() => {
    setPending(null);
    setSelected(null);
    moodMutation.reset();
  }, [moodMutation]);

  const save = useCallback(() => {
    if (!pending || !selected) return;
    moodMutation.mutate(
      { matchId: pending.matchId, mood: selected },
      { onSuccess: () => close() },
    );
  }, [pending, selected, moodMutation, close]);

  return (
    <Modal
      isOpen={pending !== null}
      onClose={close}
      title={t("mood:modal.title")}
      description={t("mood:modal.description")}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t("mood:modal.skip")}
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={!selected}
            isLoading={moodMutation.isPending}
          >
            {t("common:buttons.save")}
          </Button>
        </div>
      }
    >
      <div className="py-2">
        <MoodPicker value={selected} onChange={setSelected} size="lg" disabled={moodMutation.isPending} />
        {moodMutation.isError && (
          <p className="mt-3 text-center text-xs text-accent-danger">
            {t("mood:modal.error")}
          </p>
        )}
      </div>
    </Modal>
  );
}
