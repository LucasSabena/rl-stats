import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MoodPicker } from "@/components/mood/MoodPicker";
import { useSetMatchMood } from "@/hooks/useSetMatchMood";
import { useUIStore } from "@/stores/uiStore";
import { MOODS, type MoodKey } from "@/lib/moods";

interface MatchFinishedPayload {
  matchId: number;
  guid: string;
  isTraining?: boolean;
  winner?: number | null;
  scoreBlue?: number;
  scoreOrange?: number;
  /** True when the backend showed the focus prompt window instead. */
  promptShown?: boolean;
}

interface PendingMatch {
  matchId: number;
  isTraining: boolean;
}

/**
 * Post-match mood prompt inside the main window, mounted once at the app root.
 *
 * Opens on `match-finished` (training stints excluded) and — unlike the focus
 * prompt window over the game — it does NOT disappear when the next match
 * begins. Rating is optional, so the question waits until the player answers,
 * skips it, or a newer match replaces it. That is the whole point: with a
 * competitive queue there is rarely time to react on the post-game screen.
 */
export function MatchMoodModal() {
  const { t } = useTranslation(["mood", "common"]);
  const [pending, setPending] = useState<PendingMatch | null>(null);
  const [selected, setSelected] = useState<MoodKey | null>(null);

  const moodMutation = useSetMatchMood();
  const addToast = useUIStore((state) => state.addToast);

  useEffect(() => {
    let unlistenFinished: UnlistenFn | null = null;
    let cancelled = false;

    async function setup() {
      try {
        unlistenFinished = await listen<MatchFinishedPayload>("match-finished", (event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.isTraining) return;
          // The focus prompt window handles this match — stand down so the
          // player is never asked twice.
          if (payload.promptShown) return;
          if (typeof payload.matchId !== "number") return;
          setPending({ matchId: payload.matchId, isTraining: false });
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
    };
  }, []);

  const close = useCallback(() => {
    setPending(null);
    setSelected(null);
    moodMutation.reset();
  }, [moodMutation]);

  const save = useCallback(
    (mood?: MoodKey) => {
      const choice = mood ?? selected;
      if (!pending || !choice) return;
      setSelected(choice);
      moodMutation.mutate(
        { matchId: pending.matchId, mood: choice },
        {
          onSuccess: () => {
            addToast({
              type: "success",
              title: t("mood:toast.saved"),
              message: t("mood:toast.savedMessage"),
            });
            close();
          },
          onError: (error) => {
            console.error("[mood] failed to save match mood", error);
          },
        },
      );
    },
    [pending, selected, moodMutation, close, addToast, t],
  );

  // Keyboard shortcuts while the modal is open: 1-5 rate directly, Enter
  // saves the highlighted face, Escape skips.
  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < MOODS.length) {
        event.preventDefault();
        save(MOODS[index]);
      } else if (event.key === "Enter" && selected) {
        event.preventDefault();
        save();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, selected, save, close]);

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
            onClick={() => save()}
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
            {moodMutation.error instanceof Error && moodMutation.error.message
              ? ` ${moodMutation.error.message}`
              : ""}
          </p>
        )}
      </div>
    </Modal>
  );
}
